import path from "node:path";

const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".svn",
  ".idea",
  ".vs",
  ".venv",
  "venv",
  "node_modules",
  "bower_components",
  "vendor",
  "dist",
  "out",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
  "__pycache__",
  "target",
  "bin",
  "obj",
  "secrets",
  "credentials",
]);

const SENSITIVE_FILE_NAMES = new Set([
  ".env",
  ".npmrc",
  ".pypirc",
  "credentials.json",
  "credentials.yml",
  "credentials.yaml",
  "secrets.json",
  "secrets.yml",
  "secrets.yaml",
  "service-account.json",
  "serviceaccount.json",
  "token.json",
  "tokens.json",
  "access_token.json",
  "refresh_token.json",
  "id_rsa",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
]);

const SENSITIVE_EXTENSIONS = new Set([
  ".pem",
  ".key",
  ".p12",
  ".pfx",
  ".cer",
  ".crt",
  ".kdbx",
  ".keystore",
  ".jks",
  ".token",
]);

const PRIVATE_KEY_STEMS = new Set(["id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"]);

export function normalizeRelativePath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.\/+/, "");
}

export function isExcludedPath(filePath: string): boolean {
  const normalized = normalizeRelativePath(filePath);
  if (!normalized || normalized.includes("\0")) {
    return true;
  }
  const parts = normalized.split("/").filter((part) => part.length > 0);
  if (parts.some((part) => part === "." || part === "..")) {
    return true;
  }
  if (parts.some((part) => EXCLUDED_DIRECTORIES.has(part.toLowerCase()))) {
    return true;
  }
  const base = (parts[parts.length - 1] ?? normalized).toLowerCase();
  if (base === ".env" || base.startsWith(".env.")) {
    return true;
  }
  if (SENSITIVE_FILE_NAMES.has(base)) {
    return true;
  }
  if (base.endsWith(".pub") && PRIVATE_KEY_STEMS.has(base.slice(0, -4))) {
    return true;
  }
  const extension = path.posix.extname(base);
  return SENSITIVE_EXTENSIONS.has(extension);
}

export function isSafeRelativePath(filePath: string): boolean {
  const normalized = normalizeRelativePath(filePath);
  if (!normalized || normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) {
    return false;
  }
  return !isExcludedPath(normalized);
}

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".zip",
  ".gz",
  ".7z",
  ".wasm",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".mp4",
  ".mp3",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".map",
  ".lock",
]);

export function isBinaryPath(filePath: string): boolean {
  const extension = path.posix.extname(normalizeRelativePath(filePath).toLowerCase());
  return BINARY_EXTENSIONS.has(extension);
}

export function diffLooksSensitive(diff: string): boolean {
  if (/-----BEGIN [A-Z0-9 ]*(?:PRIVATE KEY|CERTIFICATE)-----/.test(diff)) {
    return true;
  }
  for (const line of diff.split(/\r?\n/)) {
    if (!line.startsWith("diff --git ")) {
      continue;
    }
    const filePath = diffGitPath(line);
    if (filePath && isExcludedPath(filePath)) {
      return true;
    }
  }
  return false;
}

function diffGitPath(line: string): string | undefined {
  const rest = line.slice("diff --git ".length);
  const quoted = /^"a\/(.+)"\s+b\//.exec(rest);
  if (quoted?.[1]) {
    return quoted[1];
  }
  const plain = /^a\/(\S+)\s+b\//.exec(rest);
  return plain?.[1];
}

export function toWorkspaceRelative(root: string, absolute: string): string | undefined {
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return undefined;
  }
  return normalizeRelativePath(relative);
}
