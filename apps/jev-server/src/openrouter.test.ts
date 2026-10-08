import { LIMITS } from "@jev/contracts";
import { describe, expect, it } from "vitest";
import {
  ContextLimitError,
  InvalidProviderResponseError,
  ProviderRequestError,
  ProviderUnavailableError,
} from "./errors.js";
import { ANALYSIS_SYSTEM_PROMPT } from "./prompt.js";
import { OpenRouterProvider } from "./providers/openrouter.js";
import type { CompletionRequest, ProviderAnalysisInput } from "./providers/types.js";
import { createStack } from "./stack.js";

const input: ProviderAnalysisInput = {
  task: "Identify one architectural concern in this small example and explain it briefly.",
  workspaceName: "example",
  structure: ["example.ts"],
  currentFile: {
    path: "example.ts",
    content: 'export function getUser(id: string) {\n  return database.query("SELECT * FROM users WHERE id = " + id);\n}',
  },
  relevantFiles: [],
};

const validOutput = {
  summary: "Potential architecture issue detected.",
  recommendation: "Use parameterized queries instead of string concatenation.",
  findings: [
    {
      category: "security",
      severity: "high",
      title: "SQL injection in query construction",
      description: "The query is built with string concatenation from user input.",
      evidence: ['database.query("SELECT * FROM users WHERE id = " + id)'],
      recommendation: "Use parameterized queries instead of string concatenation.",
      why: "The supplied example concatenates a parameter directly into a SQL statement.",
      uncertainty: "This is limited to the supplied context and is not a certainty.",
      confidence: 0.9,
      affectedFiles: ["example.ts"],
    },
  ],
};

describe("OpenRouter provider", () => {
  it("does not call OpenRouter when the key is missing", async () => {
    let called = false;
    const provider = new OpenRouterProvider({
      apiKey: "",
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
    const provider = new OpenRouterProvider({
      apiKey: "sk-or-test",
      model: "openrouter/free",
      complete: async (request) => {
        calls.push(request);
        return validOutput;
      },
    });
    const result = await provider.analyze(input);
    expect(result.findings).toHaveLength(1);
    expect(calls[0]?.system).toContain(ANALYSIS_SYSTEM_PROMPT);
    expect(calls[0]?.system).toContain("JSON object");
    expect(calls[0]?.user).toContain("UNTRUSTED PROJECT CONTENT");
    expect(calls[0]?.user).not.toContain("sk-or-test");
    expect(calls[0]?.model).toBe("openrouter/free");
    expect(result.findings[0]?.category).toBe("security");
  });

  it("rejects a malformed provider payload", async () => {
    const provider = new OpenRouterProvider({
      apiKey: "sk-or-test",
      complete: async () => ({ summary: "Missing the rest" }),
    });
    await expect(provider.analyze(input)).rejects.toBeInstanceOf(InvalidProviderResponseError);
  });

  it("maps provider failures without keeping the upstream message", async () => {
    const provider = new OpenRouterProvider({
      apiKey: "sk-or-test",
      complete: async () => {
        throw Object.assign(new Error("prompt echo of private source"), { status: 401 });
      },
    });
    const error = await provider.analyze(input).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProviderRequestError);
    expect(error instanceof Error ? error.message : "").not.toContain("private source");
  });

  it("does not call OpenRouter when the context budget is exceeded", async () => {
    let called = false;
    const provider = new OpenRouterProvider({
      apiKey: "sk-or-test",
      complete: async () => {
        called = true;
        return validOutput;
      },
    });
    await expect(
      provider.analyze({
        ...input,
        currentFile: {
          path: "example.ts",
          content: "x".repeat(LIMITS.maxTotalContextChars + 1),
        },
      }),
    ).rejects.toBeInstanceOf(ContextLimitError);
    expect(called).toBe(false);
  });

  it("is selected by createStack for the openrouter provider", () => {
    const stack = createStack({
      host: "127.0.0.1",
      port: 8787,
      provider: "openrouter",
      anthropicApiKey: "",
      anthropicModel: "claude-sonnet-5-5",
      openrouterApiKey: "sk-or-test",
      openrouterModel: "openrouter/free",
    });
    expect(stack.analyst.capabilities()).toMatchObject({
      id: "openrouter",
      label: "OpenRouter",
      model: "openrouter/free",
      available: true,
    });
    const openrouter = stack.catalog.find((model) => model.provider === "openrouter");
    expect(openrouter).toMatchObject({ label: "OpenRouter", available: true });
    expect(stack.catalog.find((model) => model.provider === "anthropic")?.available).toBe(false);
  });

  it("marks OpenRouter as unavailable in the catalog when the key is missing", () => {
    const stack = createStack({
      host: "127.0.0.1",
      port: 8787,
      provider: "openrouter",
      anthropicApiKey: "",
      anthropicModel: "claude-sonnet-5-5",
      openrouterApiKey: "",
      openrouterModel: "openrouter/free",
    });
    expect(stack.catalog.find((model) => model.provider === "openrouter")?.available).toBe(false);
  });
});
