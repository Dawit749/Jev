import { describe, expect, it } from "vitest";
import { providerUsageSchema } from "@jev/contracts";
import { normalizeUsage, unavailableUsage } from "./usage.js";

describe("provider usage normalization", () => {
  it("normalizes valid camelCase usage", () => {
    const usage = normalizeUsage({
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      rawUsage: { inputTokens: 100, outputTokens: 40, totalTokens: 140 },
    });
    expect(usage).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      inputTokens: 100,
      outputTokens: 40,
      totalTokens: 140,
      source: "provider",
    });
  });

  it("normalizes provider-style snake_case usage", () => {
    const usage = normalizeUsage({
      provider: "openrouter",
      model: "some/model",
      rawUsage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 },
    });
    expect(usage.inputTokens).toBe(120);
    expect(usage.outputTokens).toBe(30);
    expect(usage.totalTokens).toBe(150);
    expect(usage.source).toBe("provider");
  });

  it("keeps partial usage without fabricating missing values", () => {
    const usage = normalizeUsage({
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      rawUsage: { inputTokens: 10, outputTokens: 5 },
    });
    expect(usage.inputTokens).toBe(10);
    expect(usage.outputTokens).toBe(5);
    expect(usage.totalTokens).toBeUndefined();
  });

  it("treats missing usage as unavailable, not zero", () => {
    const usage = normalizeUsage({ provider: "anthropic", model: "claude", rawUsage: undefined });
    expect(usage.source).toBe("unavailable");
    expect(usage.inputTokens).toBeUndefined();
    expect(usage.outputTokens).toBeUndefined();
    expect(JSON.stringify(usage)).not.toContain('"0"');
    expect(unavailableUsage("anthropic", "claude").source).toBe("unavailable");
  });

  it("rejects negative and non-integer tokens as unavailable", () => {
    const negative = normalizeUsage({
      provider: "anthropic",
      model: "claude",
      rawUsage: { inputTokens: -5, outputTokens: 10 },
    });
    expect(negative.inputTokens).toBeUndefined();
    expect(negative.outputTokens).toBe(10);
    expect(negative.totalTokens).toBeUndefined();

    const fractional = normalizeUsage({
      provider: "anthropic",
      model: "claude",
      rawUsage: { inputTokens: 1.5 },
    });
    expect(fractional.inputTokens).toBeUndefined();
    expect(fractional.source).toBe("unavailable");
  });

  it("drops contradictory totals instead of reporting them", () => {
    const usage = normalizeUsage({
      provider: "anthropic",
      model: "claude",
      rawUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 999 },
    });
    expect(usage.inputTokens).toBe(10);
    expect(usage.outputTokens).toBe(5);
    expect(usage.totalTokens).toBeUndefined();
  });

  it("treats malformed usage as unavailable", () => {
    const usage = normalizeUsage({
      provider: "anthropic",
      model: "claude",
      rawUsage: { inputTokens: "many", outputTokens: null },
    });
    expect(usage.source).toBe("unavailable");
    expect(usage.inputTokens).toBeUndefined();
  });

  it("produces output that satisfies the provider-neutral contract", () => {
    const usage = normalizeUsage({
      provider: "openrouter",
      model: "some/model",
      rawUsage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    });
    expect(providerUsageSchema.safeParse(usage).success).toBe(true);
  });

  it("does not carry provider-specific raw fields", () => {
    const usage = normalizeUsage({
      provider: "openrouter",
      model: "some/model",
      rawUsage: { prompt_tokens: 1, completion_tokens: 2, cost: 0.5, extra_field: "secret" },
    });
    const serialized = JSON.stringify(usage);
    expect(serialized).not.toContain("extra_field");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("prompt_tokens");
  });
});
