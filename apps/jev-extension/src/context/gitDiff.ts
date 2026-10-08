import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isSafeRelativePath } from "@jev/shared";

const execFileAsync = promisify(execFile);

export async function readCurrentFileDiff(
  root: string,
  relativePath: string,
): Promise<string | undefined> {
  if (!isSafeRelativePath(relativePath) || relativePath.startsWith("-")) {
    return undefined;
  }
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", root, "diff", "--no-ext-diff", "--no-color", "--unified=3", "--", relativePath],
      { timeout: 2_000, maxBuffer: 200_000, windowsHide: true },
    );
    const text = stdout.trim();
    return text.length > 0 ? stdout : undefined;
  } catch {
    return undefined;
  }
}
