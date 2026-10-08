import { describe, expect, it } from "vitest";
import { AnthropicProvider } from "./providers/anthropic.js";
import { OpenRouterProvider } from "./providers/openrouter.js";
import type { CompletionRequest, ProviderAnalysisInput } from "./providers/types.js";

const input: ProviderAnalysisInput = {
  task: "Review the authentication change for architecture issues",
  workspaceName: "example",
  structure: ["example.ts"],
  currentFile: { path: "example.ts", content: "export function login() {}" },
  relevantFiles: [],
};

const validOutput = {
  summary: "Potential architecture issue detected.",
  recommendation: "Move the logic.",
  findings: [
    {
      category: "architecture",
      severity: "medium",
      title: "Business logic in controller",
      description: "Authentication rules appear in the controller.",
      evidence: ["The controller contains authentication rules."],
      recommendation: "Move the rules.",
      why: "The controller path contains authentication rules.",
      uncertainty: "This is limited to the supplied context.",
      confidence: 0.8,
      affectedFiles: ["example.ts"],
    },
  ],
};

describe("anthropic usage capture", () => {
  it("captures normalized usage from the completion result", async () => {
    const provider = new AnthropicProvider({
      apiKey: "sk-ant-test",
      model: "claude-sonnet-5-5",
      complete: async () => ({
        output: validOutput,
        usage: {
          provider: "anthropic",
          model: "claude-sonnet-5-5",
          inputTokens: 100,
          outputTokens: 40,
          totalTokens: 140,
          source: "provider",
        },
      }),
    });
    const result = await provider.analyze(input);
    expect(result.usage?.inputTokens).toBe(100);
    expect(result.usage?.outputTokens).toBe(40);
    expect(result.usage?.source).toBe("provider");
  });

  it("returns unavailable usage when the completion supplies none", async () => {
    const provider = new AnthropicProvider({
      apiKey: "sk-ant-test",
      model: "claude-sonnet-5-5",
      complete: async () => ({ output: validOutput }),
    });
    const result = await provider.analyze(input);
    expect(result.usage?.source).toBe("unavailable");
  });

  it("still validates the structured output alongside usage", async () => {
    const provider = new AnthropicProvider({
      apiKey: "sk-ant-test",
      model: "claude-sonnet-5-5",
      complete: async () => ({ output: { summary: "missing the rest" } }),
    });
    await expect(provider.analyze(input)).rejects.toThrow(/invalid response/i);
  });
});

describe("openrouter usage capture", () => {
  it("captures normalized usage and the resolved model", async () => {
    const calls: CompletionRequest[] = [];
    const provider = new OpenRouterProvider({
      apiKey: "sk-or-test",
      model: "openrouter/free",
      complete: async (request) => {
        calls.push(request);
        return {
          output: validOutput,
          usage: {
            provider: "openrouter",
            model: "some/resolved-model",
            inputTokens: 200,
            outputTokens: 50,
            totalTokens: 250,
            source: "provider",
          },
        };
      },
    });
    const result = await provider.analyze(input);
    expect(result.usage?.model).toBe("some/resolved-model");
    expect(result.usage?.totalTokens).toBe(250);
    expect(result.usage?.source).toBe("provider");
  });

  it("returns unavailable usage when the completion supplies none", async () => {
    const provider = new OpenRouterProvider({
      apiKey: "sk-or-test",
      model: "openrouter/free",
      complete: async () => ({ output: validOutput }),
    });
    const result = await provider.analyze(input);
    expect(result.usage?.source).toBe("unavailable");
  });

  it("keeps malformed usage as unavailable without breaking analysis", async () => {
    const provider = new OpenRouterProvider({
      apiKey: "sk-or-test",
      model: "openrouter/free",
      complete: async () => ({
        output: validOutput,
        usage: { provider: "openrouter", model: "m", source: "provider", inputTokens: -1 },
      }),
    });
    const result = await provider.analyze(input);
    expect(result.usage?.inputTokens).toBeUndefined();
    expect(result.usage?.source).toBe("unavailable");
  });
});
