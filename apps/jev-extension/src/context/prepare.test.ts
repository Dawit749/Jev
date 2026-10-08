import { analysisRequestSchema } from "@jev/contracts";
import { describe, expect, it } from "vitest";
import { prepareAnalysisRequest } from "./prepare";

describe("context preparation", () => {
  it("drops secret files and still produces a valid request", () => {
    const prepared = prepareAnalysisRequest({
      task: "Review the authentication change for architecture issues",
      workspaceName: "sample-auth",
      language: "typescript",
      structure: [
        "src/api/authController.ts",
        ".env",
        "node_modules/pkg/index.js",
        "certs/key.pem",
      ],
      currentFile: { path: ".env", content: "API_KEY=secret-value", languageId: "dotenv" },
      relevantFiles: [
        { path: "src/api/authController.ts", content: "export function login() { return true; }" },
        { path: "id_rsa", content: "-----BEGIN PRIVATE KEY-----\nsecret" },
      ],
      gitDiff: "diff --git a/.env b/.env\n+API_KEY=secret-value",
      clientVersion: "1.90.0",
    });
    expect(prepared.excludedSensitive).toBe(true);
    expect(prepared.request.currentFile).toBeUndefined();
    expect(prepared.request.gitDiff).toBeUndefined();
    expect(prepared.request.workspace.structure).toEqual(["src/api/authController.ts"]);
    expect(prepared.request.relevantFiles?.map((file) => file.path)).toEqual([
      "src/api/authController.ts",
    ]);
    expect(JSON.stringify(prepared.request)).not.toContain("secret-value");
    expect(JSON.stringify(prepared.request)).not.toContain("BEGIN PRIVATE KEY");
    expect(analysisRequestSchema.safeParse(prepared.request).success).toBe(true);
  });

  it("narrows oversized file content", () => {
    const prepared = prepareAnalysisRequest({
      task: "Explain this module",
      workspaceName: "demo",
      structure: ["src/big.ts"],
      currentFile: { path: "src/big.ts", content: "a".repeat(50_000) },
      clientVersion: "1.90.0",
    });
    expect(prepared.narrowed).toBe(true);
    expect(prepared.request.contextNarrowed).toBe(true);
    expect(prepared.request.currentFile?.content.length).toBeLessThanOrEqual(40_000);
    expect(prepared.request.currentFile?.content.endsWith("[truncated]")).toBe(true);
  });
});
