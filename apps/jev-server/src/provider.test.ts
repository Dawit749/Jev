import { request as httpRequest } from "node:http";
import { APIConnectionTimeoutError } from "@anthropic-ai/sdk";
import { LIMITS } from "@jev/contracts";
import { describe, expect, it } from "vitest";
import { startJevServer } from "./app.js";
import {
  ContextLimitError,
  InvalidProviderResponseError,
  ProviderRequestError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from "./errors.js";
import { createSafeLogger } from "./log.js";
import { ANALYSIS_SYSTEM_PROMPT } from "./prompt.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import type { CompletionRequest, ProviderAnalysisInput } from "./providers/types.js";
import { createStack } from "./stack.js";

const input: ProviderAnalysisInput = {
  task: "Review the authentication change for architecture issues",
  workspaceName: "sample-auth",
  structure: ["src/api/authController.ts"],
  currentFile: { path: "src/api/authController.ts", content: "export function login() {}" },
  relevantFiles: [],
};

const validOutput = {
  summary: "Potential architecture issue detected.",
  recommendation: "Move business logic into the application service.",
  findings: [
    {
      category: "architecture",
      severity: "medium",
      title: "Business logic in controller",
      description: "Authentication rules appear in the controller.",
      evidence: ["The controller contains authentication rules."],
      recommendation: "Move the rules into the application service.",
      why: "The controller path contains authentication rules that sit outside an application service.",
      uncertainty: "This is limited to the supplied project context and is not a certainty.",
      confidence: 0.86,
      affectedFiles: ["src/api/authController.ts"],
    },
  ],
};

describe("Anthropic provider", () => {
  it("does not call Claude when the key is missing", async () => {
    let called = false;
    const provider = new AnthropicProvider({
      apiKey: "",
      model: "claude-sonnet-5-5",
      complete: async () => {
        called = true;
        return validOutput;
      },
    });
    await expect(provider.analyze(input)).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(called).toBe(false);
  });

  it("sends the system prompt separately and validates the structured result", async () => {
    const calls: CompletionRequest[] = [];
    const provider = new AnthropicProvider({
      apiKey: "sk-ant-test",
      model: "claude-sonnet-5-5",
      complete: async (request) => {
        calls.push(request);
        return validOutput;
      },
    });
    const result = await provider.analyze(input);
    expect(result.findings).toHaveLength(1);
    expect(calls[0]?.system).toBe(ANALYSIS_SYSTEM_PROMPT);
    expect(calls[0]?.user).toContain("UNTRUSTED PROJECT CONTENT");
    expect(calls[0]?.user).not.toContain("sk-ant-test");
    expect(calls[0]?.model).toBe("claude-sonnet-5-5");
  });

  it("rejects a malformed provider payload", async () => {
    const provider = new AnthropicProvider({
      apiKey: "sk-ant-test",
      model: "claude-sonnet-5-5",
      complete: async () => ({ summary: "Missing the rest" }),
    });
    await expect(provider.analyze(input)).rejects.toBeInstanceOf(InvalidProviderResponseError);
  });

  it("maps provider failures without keeping the upstream message", async () => {
    const provider = new AnthropicProvider({
      apiKey: "sk-ant-test",
      model: "claude-sonnet-5-5",
      complete: async () => {
        throw Object.assign(new Error("prompt echo of private source"), { status: 401 });
      },
    });
    const error = await provider.analyze(input).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProviderRequestError);
    expect(error instanceof Error ? error.message : "").not.toContain("private source");
  });

  it("maps a provider timeout without retrying or echoing the cause", async () => {
    let calls = 0;
    const provider = new AnthropicProvider({
      apiKey: "sk-ant-test",
      model: "claude-sonnet-5-5",
      complete: async () => {
        calls += 1;
        throw new APIConnectionTimeoutError({ message: "timed out while sending private source" });
      },
    });
    const error = await provider.analyze(input).catch((caught: unknown) => caught);
    expect(calls).toBe(1);
    expect(error).toBeInstanceOf(ProviderTimeoutError);
    expect(error instanceof Error ? error.message : "").toBe(
      "The analysis provider timed out. Try again.",
    );
    expect(error instanceof Error ? error.message : "").not.toContain("private source");
  });

  it("does not call Claude when the context budget is exceeded", async () => {
    let called = false;
    const provider = new AnthropicProvider({
      apiKey: "sk-ant-test",
      model: "claude-sonnet-5-5",
      complete: async () => {
        called = true;
        return validOutput;
      },
    });
    await expect(
      provider.analyze({
        ...input,
        currentFile: {
          path: "src/api/authController.ts",
          content: "x".repeat(LIMITS.maxTotalContextChars + 1),
        },
      }),
    ).rejects.toBeInstanceOf(ContextLimitError);
    expect(called).toBe(false);
  });
});

describe("server to Anthropic adapter", () => {
  const secretKey = "sk-ant-phase4-test-key";
  const sentinel = "SENTINEL_SOURCE_SHOULD_NOT_LOG";

  it("returns validated analysis without logging the key or source", async () => {
    const lines: string[] = [];
    const calls: CompletionRequest[] = [];
    const running = await startJevServer({
      host: "127.0.0.1",
      port: 0,
      log: createSafeLogger((line) => lines.push(line)),
      stack: createStack(
        {
          host: "127.0.0.1",
          port: 8787,
          provider: "anthropic",
          anthropicApiKey: secretKey,
          anthropicModel: "claude-sonnet-5-5",
        },
        async (request) => {
          calls.push(request);
          return validOutput;
        },
      ),
    });
    try {
      const response = await postJson(running.url, "/api/v1/analysis", {
        task: "Review the authentication change for architecture issues",
        workspace: {
          name: "sample-auth",
          language: "typescript",
          structure: ["src/api/authController.ts"],
        },
        currentFile: {
          path: "src/api/authController.ts",
          content: `${sentinel} export function login() {}`,
        },
        client: { ide: "vscode", version: "0.1.0" },
      });
      expect(response.status).toBe(200);
      const body = JSON.parse(response.body) as {
        summary: string;
        findings: { id: string; evidence: string[]; why: string; category: string }[];
        analysisProvider: { provider: string; model: string };
      };
      expect(body.summary.length).toBeGreaterThan(0);
      expect(body.findings[0]?.id).toBe("f1");
      expect(body.findings[0]?.category).toBe("architecture");
      expect(body.findings[0]?.evidence.length).toBeGreaterThan(0);
      expect(body.findings[0]?.why.length).toBeGreaterThan(0);
      expect(body.analysisProvider).toEqual({
        provider: "anthropic",
        model: "claude-sonnet-5-5",
        label: "Claude",
      });
      expect(calls[0]?.system).toBe(ANALYSIS_SYSTEM_PROMPT);
      expect(calls[0]?.user.indexOf("UNTRUSTED PROJECT CONTENT")).toBeLessThan(
        calls[0]?.user.indexOf(sentinel) ?? -1,
      );
      expect(calls[0]?.apiKey).toBe(secretKey);
      expect(response.body).not.toContain(secretKey);
      expect(response.body).not.toContain(sentinel);
      expect(lines.join("\n")).not.toContain(secretKey);
      expect(lines.join("\n")).not.toContain(sentinel);
    } finally {
      await running.close();
    }
  });

  it("reports a missing key, an invalid payload, and a provider failure through the API", async () => {
    const missing = await startJevServer({
      host: "127.0.0.1",
      port: 0,
      stack: createStack({
        host: "127.0.0.1",
        port: 8787,
        provider: "anthropic",
        anthropicApiKey: "",
        anthropicModel: "claude-sonnet-5-5",
      }),
    });
    try {
      const response = await postJson(missing.url, "/api/v1/analysis", analysisBody());
      expect(response.status).toBe(503);
      expect(response.body).toContain("PROVIDER_UNAVAILABLE");
      expect(response.body).not.toContain("stack");
    } finally {
      await missing.close();
    }

    const invalid = await startWithComplete(async () => ({ summary: "Missing the rest" }));
    try {
      const response = await postJson(invalid.url, "/api/v1/analysis", analysisBody());
      expect(response.status).toBe(502);
      expect(response.body).toContain("PROVIDER_RESPONSE_INVALID");
    } finally {
      await invalid.close();
    }

    const failed = await startWithComplete(async () => {
      throw Object.assign(new Error("private source leaked in the provider error"), { status: 500 });
    });
    try {
      const response = await postJson(failed.url, "/api/v1/analysis", analysisBody());
      expect(response.status).toBe(503);
      expect(response.body).toContain("could not complete the request");
      expect(response.body).not.toContain("private source");
    } finally {
      await failed.close();
    }
  });
});

function analysisBody() {
  return {
    task: "Review the authentication change for architecture issues",
    workspace: {
      name: "sample-auth",
      structure: ["src/api/authController.ts"],
    },
    currentFile: {
      path: "src/api/authController.ts",
      content: "export function login() {}",
    },
    client: { ide: "vscode", version: "0.1.0" },
  };
}

function startWithComplete(complete: (request: CompletionRequest) => Promise<unknown>) {
  return startJevServer({
    host: "127.0.0.1",
    port: 0,
    stack: createStack(
      {
        host: "127.0.0.1",
        port: 8787,
        provider: "anthropic",
        anthropicApiKey: "sk-ant-phase4-test-key",
        anthropicModel: "claude-sonnet-5-5",
      },
      complete,
    ),
  });
}

function postJson(url: string, path: string, body: unknown): Promise<{ status: number; body: string }> {
  const payload = JSON.stringify(body);
  const parsed = new URL(path, url);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: "POST",
        headers: {
          host: `${parsed.hostname}:${parsed.port}`,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    req.on("error", reject);
    req.end(payload);
  });
}

describe("future providers", () => {
  it("refuses to invent an analysis for a provider that is not connected", async () => {
    const stack = createStack({
      host: "127.0.0.1",
      port: 8787,
      provider: "anthropic",
      anthropicApiKey: "",
      anthropicModel: "claude-sonnet-5-5",
    });
    await expect(stack.placeholders[0]?.analyze(input)).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });
});
