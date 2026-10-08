import {
  FIT_DISCLAIMER,
  recommendationRequestSchema,
  recommendationResponseSchema,
} from "@jev/contracts";
import { describe, expect, it } from "vitest";
import { HttpError, InvalidRecommendationError } from "./errors.js";
import { UnavailableProvider } from "./providers/unavailable.js";
import type { ModelProvider, ProviderAnalysisInput } from "./providers/types.js";
import { JevModelRouter } from "./router.js";
import {
  CLAUDE_PROFILE,
  GEMINI_PROFILE,
  GPT_PROFILE,
  scoreModels,
  type ScoreableModel,
} from "./scoring.js";
import { comparisonCatalog, type AnalysisStack } from "./stack.js";

const claudeOnly = comparisonCatalog(true);
const noneConnected = comparisonCatalog(false);

function withAvailability(
  flags: Partial<Record<"anthropic" | "openai" | "google", boolean>>,
): ScoreableModel[] {
  return comparisonCatalog(false).map((model) => ({
    ...model,
    available: flags[model.provider as "anthropic" | "openai" | "google"] === true,
  }));
}

function stack(models: readonly ScoreableModel[], analyst?: ModelProvider): AnalysisStack {
  return {
    analyst: analyst ?? silentAnalyst(),
    catalog: [...models],
    placeholders: [
      new UnavailableProvider("openai", "GPT", "gpt", GPT_PROFILE),
      new UnavailableProvider("google", "Gemini", "gemini", GEMINI_PROFILE),
    ],
  };
}

function silentAnalyst(): ModelProvider {
  return {
    id: "anthropic",
    capabilities: () => ({
      id: "anthropic",
      label: "Claude",
      model: "claude-sonnet-5-5",
      available: true,
      profile: CLAUDE_PROFILE,
    }),
    analyze: () => Promise.reject(new Error("recommendation must not call a provider")),
  };
}

const sampleInput: ProviderAnalysisInput = {
  task: "Review the module",
  workspaceName: "demo",
  structure: [],
  relevantFiles: [],
};

describe("model advisor", () => {
  it("classifies a simple coding task and recommends the connected model", () => {
    const result = scoreModels({
      task: "fix the typo in the comment",
      contextChars: 200,
      models: claudeOnly,
    });
    expect(result.taskClassification).toEqual({
      kind: "simple_coding",
      label: "Simple coding task",
    });
    expect(result.primary.provider).toBe("anthropic");
    expect(result.primary.model).toBe("claude-sonnet-5-5");
    expect(result.primary.available).toBe(true);
    expect(result.primary.fitStatement).toContain("Fit score:");
    expect(result.primary.fitStatement).toContain("not a benchmark");
    expect(result.fitDisclaimer).toBe(FIT_DISCLAIMER);
  });

  it("classifies a complex architecture task toward the reasoning profile", () => {
    const result = scoreModels({
      task: "Refactor the service boundary to reduce coupling",
      contextChars: 2_000,
      models: claudeOnly,
    });
    expect(result.taskClassification.kind).toBe("architecture");
    expect(result.primary).toMatchObject({ provider: "anthropic", available: true });
    expect(result.primary.reasons).toContain("High reasoning need");
    expect(result.primary.fitStatement).toContain("Jev estimates Claude is a strong fit");
  });

  it("classifies a large-context task and records the context factor", () => {
    const result = scoreModels({
      task: "Review the authentication change for architecture issues",
      contextChars: 40_000,
      models: claudeOnly,
    });
    expect(result.taskClassification.kind).toBe("large_context");
    const context = result.factors.find((factor) => factor.id === "context");
    expect(context?.signal).toBeGreaterThanOrEqual(0.6);
    expect(result.primary.reasons).toContain("Large project context");
    expect(result.primary.available).toBe(true);
  });

  it("classifies a reasoning-heavy task separately from a code edit", () => {
    const result = scoreModels({
      task: "Explain the trade-off and the security design",
      contextChars: 500,
      models: claudeOnly,
    });
    expect(result.taskClassification.kind).toBe("reasoning");
    expect(
      result.factors.find((factor) => factor.id === "reasoning")?.signal,
    ).toBeGreaterThanOrEqual(0.7);
    expect(result.primary.provider).toBe("anthropic");
  });

  it("classifies a speed-sensitive task without recommending a disconnected model", () => {
    const connected = scoreModels({
      task: "quickly fix the typo in the comment",
      contextChars: 100,
      models: claudeOnly,
    });
    expect(connected.taskClassification.kind).toBe("speed");
    expect(connected.primary).toMatchObject({ provider: "anthropic", available: true });
    const disconnected = connected.alternatives.find((item) => item.provider === "google");
    expect(disconnected?.available).toBe(false);
    expect(disconnected?.reasons).toContain("Faster option for a simpler task");
    expect(disconnected?.fitStatement).toContain("is not connected");

    const future = scoreModels({
      task: "quickly fix the typo in the comment",
      contextChars: 100,
      models: withAvailability({ anthropic: true, openai: true, google: true }),
    });
    expect(future.primary.provider).toBe("google");
    expect(future.primary.available).toBe(true);
  });

  it("classifies a cost-sensitive task and can prefer a future lower-cost profile", () => {
    const connected = scoreModels({
      task: "cheap fix for the typo in the comment",
      contextChars: 100,
      models: claudeOnly,
    });
    expect(connected.taskClassification.kind).toBe("cost");
    expect(connected.primary.provider).toBe("anthropic");
    expect(connected.primary.available).toBe(true);
    expect(connected.alternatives.find((item) => item.provider === "google")?.reasons).toContain(
      "Lower-cost fit",
    );

    const future = scoreModels({
      task: "cheap fix for the typo in the comment",
      contextChars: 100,
      models: withAvailability({ anthropic: true, openai: true, google: true }),
    });
    expect(future.primary.provider).toBe("google");
    expect(future.factors.find((factor) => factor.id === "cost")?.signal).toBeGreaterThanOrEqual(
      0.7,
    );
  });

  it("represents an unavailable provider as unavailable and does not call it", async () => {
    let calls = 0;
    const placeholder = new UnavailableProvider("google", "Gemini", "gemini", GEMINI_PROFILE);
    await expect(
      placeholder.analyze({ ...sampleInput, task: "Review the password storage design" }),
    ).rejects.toThrow(/not connected/);
    const analyst: ModelProvider = {
      ...silentAnalyst(),
      analyze: () => {
        calls += 1;
        return Promise.reject(new Error("should not analyze"));
      },
    };
    const router = new JevModelRouter(stack(noneConnected, analyst));
    const result = await router.recommend({
      task: "Review the password storage design",
      contextChars: 1_000,
    });
    expect(calls).toBe(0);
    expect(result.primary.available).toBe(false);
    expect(result.alternatives.every((item) => item.available === false)).toBe(true);
    expect(result.primary.fitStatement).toContain("is not connected");
    expect(result.factors.find((factor) => factor.id === "privacy")?.signal).toBeGreaterThan(0);
    expect(placeholder.capabilities().available).toBe(false);
  });

  it("reports provider availability without describing disconnected models as connected", async () => {
    const router = new JevModelRouter(stack(claudeOnly));
    const result = await router.recommend({
      task: "Refactor the service boundary to reduce coupling",
      contextChars: 1_000,
    });
    expect(result.primary.available).toBe(true);
    expect(result.alternatives.map((item) => item.available)).toEqual([false, false]);
    expect(result.factors.find((factor) => factor.id === "availability")?.signal).toBeCloseTo(
      1 / 3,
      2,
    );
    expect(result.fitDisclaimer).toBe(FIT_DISCLAIMER);
    expect(
      recommendationResponseSchema.parse({
        requestId: "req_advisor",
        ...{
          modelRecommendation: result.primary,
          alternatives: result.alternatives,
          taskClassification: result.taskClassification,
          factors: result.factors,
          fitDisclaimer: result.fitDisclaimer,
        },
      }).modelRecommendation.provider,
    ).toBe("anthropic");
  });

  it("returns the same recommendation for the same input", async () => {
    const router = new JevModelRouter(stack(claudeOnly));
    const input = {
      task: "Explain the trade-off and the security design",
      contextChars: 4_000,
    };
    const first = await router.recommend(input);
    const second = await router.recommend(input);
    expect(second).toEqual(first);
    expect(scoreModels({ ...input, models: claudeOnly })).toEqual(
      scoreModels({ ...input, models: claudeOnly }),
    );
  });

  it("rejects malformed recommendation input", async () => {
    expect(
      recommendationRequestSchema.safeParse({
        task: "   ",
        client: { ide: "vscode", version: "0.1.0" },
      }).success,
    ).toBe(false);
    expect(
      recommendationRequestSchema.safeParse({
        task: "Review the module",
        contextChars: -1,
        client: { ide: "vscode", version: "0.1.0" },
      }).success,
    ).toBe(false);
    const router = new JevModelRouter(stack(claudeOnly));
    await expect(router.recommend({ task: "   ", contextChars: 0 })).rejects.toBeInstanceOf(
      HttpError,
    );
    await expect(
      router.recommend({ task: "Review the module", contextChars: 1.5 }),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it("rejects malformed recommendation output", async () => {
    const valid = scoreModels({
      task: "Review the module",
      contextChars: 10,
      models: claudeOnly,
    });
    expect(
      recommendationResponseSchema.safeParse({
        requestId: "req_bad",
        modelRecommendation: { ...valid.primary, score: 1.4 },
        alternatives: valid.alternatives,
        taskClassification: valid.taskClassification,
        factors: valid.factors,
        fitDisclaimer: valid.fitDisclaimer,
      }).success,
    ).toBe(false);
    const router = new JevModelRouter(
      stack([
        {
          provider: "anthropic".repeat(10),
          label: "Claude",
          model: "claude-sonnet-5-5",
          available: true,
          order: 0,
          profile: CLAUDE_PROFILE,
        },
      ]),
    );
    await expect(
      router.recommend({ task: "Review the module", contextChars: 10 }),
    ).rejects.toBeInstanceOf(InvalidRecommendationError);
    await expect(
      new JevModelRouter(stack([])).recommend({ task: "Review the module", contextChars: 10 }),
    ).rejects.toBeInstanceOf(InvalidRecommendationError);
  });
});
