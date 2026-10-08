import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { LIMITS } from "@jev/contracts";
import { isBinaryPath, isExcludedPath, toWorkspaceRelative } from "@jev/shared";

const MAX_DEPTH = 3;
const MAX_READ_BYTES = 200_000;

export async function collectWorkspaceStructure(
  root: string,
): Promise<{ entries: string[]; truncated: boolean }> {
  const entries: string[] = [];
  let truncated = false;

  async function walk(directory: string, depth: number): Promise<void> {
    if (truncated || depth > MAX_DEPTH) {
      if (depth > MAX_DEPTH) {
        truncated = true;
      }
      return;
    }
    let items;
    try {
      items = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    items.sort((left, right) => left.name.localeCompare(right.name));
    for (const item of items) {
      if (entries.length >= LIMITS.maxStructureEntries) {
        truncated = true;
        return;
      }
      if (item.isSymbolicLink()) {
        continue;
      }
      const absolute = path.join(directory, item.name);
      const relative = toWorkspaceRelative(root, absolute);
      if (!relative || isExcludedPath(relative)) {
        continue;
      }
      if (item.isDirectory()) {
        entries.push(`${relative}/`);
        await walk(absolute, depth + 1);
      } else if (item.isFile()) {
        entries.push(relative);
      }
    }
  }

  await walk(root, 0);
  return { entries, truncated };
}

export async function collectNearbyFiles(
  root: string,
  currentRelative: string | undefined,
): Promise<{ files: { path: string; content: string }[]; truncated: boolean }> {
  if (!currentRelative || !toWorkspaceRelative(root, path.resolve(root, currentRelative))) {
    return { files: [], truncated: false };
  }
  const directory = path.dirname(currentRelative);
  const absoluteDir = path.resolve(root, directory);
  if (directory !== "." && !toWorkspaceRelative(root, absoluteDir)) {
    return { files: [], truncated: false };
  }
  let items;
  try {
    items = await readdir(absoluteDir, { withFileTypes: true });
  } catch {
    return { files: [], truncated: false };
  }
  const files: { path: string; content: string }[] = [];
  let truncated = false;
  const names = items
    .filter((item) => item.isFile() && !item.isSymbolicLink())
    .map((item) => item.name)
    .sort((left, right) => left.localeCompare(right));
  for (const name of names) {
    const relative = (
      directory === "." ? name : `${directory.replaceAll("\\", "/")}/${name}`
    ).replaceAll("\\", "/");
    if (relative === currentRelative.replaceAll("\\", "/")) {
      continue;
    }
    if (isExcludedPath(relative) || isBinaryPath(relative)) {
      truncated = truncated || isExcludedPath(relative);
      continue;
    }
    if (files.length >= LIMITS.maxRelevantFiles) {
      truncated = true;
      break;
    }
    try {
      const absolute = path.join(absoluteDir, name);
      const info = await stat(absolute);
      if (!info.isFile() || info.size > MAX_READ_BYTES) {
        truncated = true;
        continue;
      }
      const buffer = await readFile(absolute);
      if (buffer.subarray(0, 8000).includes(0)) {
        truncated = true;
        continue;
      }
      files.push({ path: relative, content: buffer.toString("utf8") });
    } catch {
      truncated = true;
    }
  }
  return { files, truncated };
}
