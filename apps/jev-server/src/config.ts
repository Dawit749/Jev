import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";

export const DEFAULT_OPENROUTER_MODEL = "openrouter/free";

export type ServerConfig = {
  host: string;
  port: number;
  provider: "anthropic" | "fake" | "openrouter";
  anthropicApiKey: string;
  anthropicModel: string;
  openrouterApiKey?: string;
  openrouterModel?: string;
};

export function parseEnvFile(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    if (!/^[A-Z0-9_]+$/.test(key)) {
      continue;
    }
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

export function applyEnv(target: NodeJS.ProcessEnv, values: Record<string, string>): void {
  for (const [key, value] of Object.entries(values)) {
    if (target[key] === undefined) {
      target[key] = value;
    }
  }
}

export function findRepoRoot(start = process.cwd()): string | undefined {
  let dir = path.resolve(start);
  for (let depth = 0; depth < 5; depth += 1) {
    const packagePath = path.join(dir, "package.json");
    if (existsSync(packagePath)) {
      try {
        const parsed = JSON.parse(readFileSync(packagePath, "utf8")) as { name?: string };
        if (parsed.name === "jev-mvp") {
          return dir;
        }
      } catch {
        // Keep walking if a package.json is unreadable.
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return undefined;
}

export function loadRepoEnv(start = process.cwd()): boolean {
  const root = findRepoRoot(start);
  if (!root) {
    return false;
  }
  const envPath = path.join(root, ".env");
  if (!existsSync(envPath)) {
    return false;
  }
  applyEnv(process.env, parseEnvFile(readFileSync(envPath, "utf8")));
  return true;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const host = env.JEV_HOST?.trim() || "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error("JEV_HOST must be a loopback address.");
  }
  const port = Number(env.JEV_PORT ?? "8787");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("JEV_PORT must be a valid port.");
  }
  const provider =
    env.JEV_PROVIDER === "fake"
      ? "fake"
      : env.JEV_PROVIDER === "openrouter"
        ? "openrouter"
        : "anthropic";
  return {
    host,
    port,
    provider,
    anthropicApiKey: env.ANTHROPIC_API_KEY?.trim() ?? "",
    anthropicModel: env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL,
    openrouterApiKey: env.OPENROUTER_API_KEY?.trim() ?? "",
    openrouterModel: env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL,
  };
}

export function publicConfig(config: ServerConfig): {
  host: string;
  port: number;
  provider: string;
  model: string;
  providerConfigured: boolean;
} {
  const openrouter = config.provider === "openrouter";
  return {
    host: config.host,
    port: config.port,
    provider: config.provider,
    model: openrouter ? (config.openrouterModel ?? DEFAULT_OPENROUTER_MODEL) : config.anthropicModel,
    providerConfigured: openrouter
      ? (config.openrouterApiKey ?? "").length > 0
      : config.anthropicApiKey.length > 0,
  };
}
