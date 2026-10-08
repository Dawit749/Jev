import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const extensionRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) {
      files.push(...sourceFiles(full));
    } else if ((full.endsWith(".ts") || full.endsWith(".json")) && !full.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}

describe("extension security boundary", () => {
  it("does not embed a provider SDK, key, or workspace-controlled server URL", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(extensionRoot, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      contributes: { configuration: { properties: { "jev.serverUrl": { scope: string } } } };
    };
    expect(packageJson.dependencies?.["@anthropic-ai/sdk"]).toBeUndefined();
    expect(packageJson.contributes.configuration.properties["jev.serverUrl"].scope).toBe(
      "application",
    );
    const banned = ["@anthropic-ai/sdk", "ANTHROPIC_API_KEY", "sk-ant-"];
    for (const file of sourceFiles(path.join(extensionRoot, "src"))) {
      const text = readFileSync(file, "utf8");
      for (const token of banned) {
        expect(text, file).not.toContain(token);
      }
    }
    const bundlePath = path.join(extensionRoot, "dist", "extension.js");
    expect(statSync(bundlePath).isFile()).toBe(true);
    const bundle = readFileSync(bundlePath, "utf8");
    for (const token of banned) {
      expect(bundle, bundlePath).not.toContain(token);
    }
  });
});
