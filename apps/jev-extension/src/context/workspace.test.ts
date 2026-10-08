import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { collectNearbyFiles, collectWorkspaceStructure } from "./workspace";

describe("workspace collection", () => {
  it("lists source files and skips secrets, git metadata, and dependencies", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "jev-context-"));
    await mkdir(path.join(root, "src", "api"), { recursive: true });
    await mkdir(path.join(root, "node_modules", "pkg"), { recursive: true });
    await mkdir(path.join(root, ".git"), { recursive: true });
    await writeFile(path.join(root, ".env"), "API_KEY=secret-value\n");
    await writeFile(path.join(root, "id_rsa"), "private-key\n");
    await writeFile(path.join(root, "node_modules", "pkg", "index.js"), "module.exports = {};\n");
    await writeFile(
      path.join(root, "src", "api", "authController.ts"),
      "export function login() {}\n",
    );
    await writeFile(path.join(root, "src", "api", "notes.ts"), "export const note = true;\n");
    await writeFile(path.join(root, "src", "api", ".env"), "TOKEN=hidden\n");

    const structure = await collectWorkspaceStructure(root);
    expect(structure.entries).toContain("src/api/authController.ts");
    expect(structure.entries.join("\n")).not.toContain(".env");
    expect(structure.entries.join("\n")).not.toContain("id_rsa");
    expect(structure.entries.join("\n")).not.toContain("node_modules");

    const nearby = await collectNearbyFiles(root, "src/api/authController.ts");
    expect(nearby.files.map((file) => file.path)).toEqual(["src/api/notes.ts"]);
    expect(JSON.stringify(nearby.files)).not.toContain("hidden");
    expect(JSON.stringify(nearby.files)).not.toContain("secret-value");
  });
});
