import { describe, expect, it } from "vitest";
import { diffLooksSensitive, isBinaryPath, isExcludedPath, isSafeRelativePath } from "./paths.js";

describe("secret and vendor exclusion", () => {
  it.each([
    ".env",
    ".env.local",
    "src/.env.production",
    "id_rsa",
    "id_ed25519.pub",
    "certs/server.pem",
    "keys/app.key",
    "credentials.json",
    "config/secrets.yaml",
    "service-account.json",
    "token.json",
    "session.token",
    "node_modules/pkg/index.js",
    "vendor/lib.js",
    ".git/config",
    "dist/index.js",
    "src/secrets/keys.ts",
    "../secrets.txt",
    "src/../../.env",
  ])("excludes %s", (filePath) => {
    expect(isExcludedPath(filePath)).toBe(true);
    expect(isSafeRelativePath(filePath)).toBe(false);
  });

  it("keeps ordinary source files", () => {
    expect(isExcludedPath("src/api/authController.ts")).toBe(false);
    expect(isExcludedPath("src/auth/password.ts")).toBe(false);
    expect(isExcludedPath("src/token.ts")).toBe(false);
    expect(isSafeRelativePath("src/domain/user.ts")).toBe(true);
  });

  it("treats certificate, token, and private-key diffs as sensitive", () => {
    expect(diffLooksSensitive("diff --git a/.env b/.env\n+API_KEY=value")).toBe(true);
    expect(diffLooksSensitive("diff --git a/certs/server.pem b/certs/server.pem\n+data")).toBe(
      true,
    );
    expect(diffLooksSensitive("diff --git a/id_ed25519 b/id_ed25519\n+data")).toBe(true);
    expect(diffLooksSensitive("diff --git a/session.token b/session.token\n+data")).toBe(true);
    expect(diffLooksSensitive("-----BEGIN CERTIFICATE-----\nMIIB")).toBe(true);
    expect(diffLooksSensitive("diff --git a/src/api/auth.ts b/src/api/auth.ts\n+export {}")).toBe(
      false,
    );
  });

  it("rejects absolute paths and skips binaries", () => {
    expect(isSafeRelativePath("/etc/passwd")).toBe(false);
    expect(isSafeRelativePath("C:/Users/me/project/src/a.ts")).toBe(false);
    expect(isBinaryPath("assets/logo.png")).toBe(true);
    expect(isBinaryPath("src/api/auth.ts")).toBe(false);
  });
});
