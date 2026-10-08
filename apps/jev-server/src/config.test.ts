import { describe, expect, it } from "vitest";
import { applyEnv, loadConfig, parseEnvFile, publicConfig } from "./config.js";

describe("server configuration", () => {
  it("parses env files without overriding existing values", () => {
    expect(parseEnvFile('# comment\nANTHROPIC_API_KEY="abc"\nJEV_PORT=9000\n')).toEqual({
      ANTHROPIC_API_KEY: "abc",
      JEV_PORT: "9000",
    });
    const target: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY: "already" };
    applyEnv(target, { ANTHROPIC_API_KEY: "from-file", JEV_PORT: "9000" });
    expect(target.ANTHROPIC_API_KEY).toBe("already");
    expect(target.JEV_PORT).toBe("9000");
  });

  it("defaults the model id in one place and refuses a public host", () => {
    const config = loadConfig({});
    expect(config.anthropicModel).toBe("claude-sonnet-5-5");
    expect(config.host).toBe("127.0.0.1");
    expect(config.anthropicApiKey).toBe("");
    expect(
      JSON.stringify(publicConfig({ ...config, anthropicApiKey: "sk-ant-secret" })),
    ).not.toContain("sk-ant-secret");
    expect(() => loadConfig({ JEV_HOST: "0.0.0.0" })).toThrow(/loopback/);
  });

  it("defaults the OpenRouter model and never exposes its key publicly", () => {
    const config = loadConfig({ JEV_PROVIDER: "openrouter", OPENROUTER_API_KEY: "sk-or-secret" });
    expect(config.provider).toBe("openrouter");
    expect(config.openrouterModel).toBe("openrouter/free");
    const publicJson = JSON.stringify(publicConfig(config));
    expect(publicJson).not.toContain("sk-or-secret");
    expect(publicJson).toContain('"providerConfigured":true');
    const unconfigured = loadConfig({ JEV_PROVIDER: "openrouter" });
    expect(JSON.stringify(publicConfig(unconfigured))).toContain('"providerConfigured":false');
  });
});
