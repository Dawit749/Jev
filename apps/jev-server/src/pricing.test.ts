import { describe, expect, it } from "vitest";
import type { PricingProfile, ProviderUsage } from "@jev/contracts";
import { estimateCost, findPricingProfile } from "./pricing.js";

const profiles: PricingProfile[] = [
  {
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    inputTokenPrice: 0.000003,
    outputTokenPrice: 0.000015,
    currency: "USD",
    effectiveDate: "2026-01-01",
    pricingVersion: "v1",
  },
  {
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    inputTokenPrice: 0.000004,
    outputTokenPrice: 0.00002,
    currency: "USD",
    effectiveDate: "2026-06-01",
    pricingVersion: "v2",
  },
  {
    provider: "openrouter",
    model: "some/model",
    inputTokenPrice: 0.000001,
    outputTokenPrice: 0.000002,
    currency: "EUR",
    effectiveDate: "2026-01-01",
    pricingVersion: "v1",
  },
];

function usage(partial: Partial<ProviderUsage>): ProviderUsage {
  return { provider: "anthropic", model: "claude-sonnet-5-5", source: "provider", ...partial };
}

describe("cost estimation", () => {
  it("computes input-only cost", () => {
    const estimate = estimateCost(usage({ inputTokens: 1_000 }), profiles);
    expect(estimate?.amount).toBeCloseTo(0.004, 6);
    expect(estimate?.estimated).toBe(true);
    expect(estimate?.currency).toBe("USD");
  });

  it("computes output-only cost", () => {
    const estimate = estimateCost(usage({ outputTokens: 1_000 }), profiles);
    expect(estimate?.amount).toBeCloseTo(0.02, 6);
  });

  it("computes input plus output cost", () => {
    const estimate = estimateCost(usage({ inputTokens: 1_000, outputTokens: 1_000 }), profiles);
    expect(estimate?.amount).toBeCloseTo(0.024, 6);
  });

  it("rounds to a stable precision", () => {
    const estimate = estimateCost(
      usage({ inputTokens: 3, outputTokens: 7 }),
      [
        {
          provider: "anthropic",
          model: "claude-sonnet-5-5",
          inputTokenPrice: 0.0000001234,
          outputTokenPrice: 0.0000005678,
          currency: "USD",
          effectiveDate: "2026-01-01",
          pricingVersion: "v1",
        },
      ],
    );
    expect(estimate?.amount).toBe(0.000004);
  });

  it("returns unavailable cost when pricing is unknown", () => {
    const estimate = estimateCost(usage({ inputTokens: 1_000, outputTokens: 1_000 }), []);
    expect(estimate).toBeUndefined();
    const unknownModel = estimateCost(
      { provider: "anthropic", model: "not-priced", source: "provider", inputTokens: 5 },
      profiles,
    );
    expect(unknownModel).toBeUndefined();
  });

  it("returns unavailable cost when token counts are missing", () => {
    expect(estimateCost(usage({ source: "unavailable" }), profiles)).toBeUndefined();
    expect(estimateCost(usage({}), profiles)).toBeUndefined();
  });

  it("prefers the newest versioned pricing profile", () => {
    const profile = findPricingProfile("anthropic", "claude-sonnet-5-5", profiles);
    expect(profile?.pricingVersion).toBe("v2");
    const estimate = estimateCost(usage({ inputTokens: 1_000 }), profiles);
    expect(estimate?.pricingVersion).toBe("v2");
  });

  it("does not assume USD and carries the configured currency", () => {
    const estimate = estimateCost(
      { provider: "openrouter", model: "some/model", source: "provider", inputTokens: 1_000 },
      profiles,
    );
    expect(estimate?.currency).toBe("EUR");
  });

  it("matches model aliases case-insensitively", () => {
    const estimate = estimateCost(
      { provider: "Anthropic", model: "CLAUDE-SONNET-5-5", source: "provider", inputTokens: 1_000 },
      profiles,
    );
    expect(estimate?.amount).toBeCloseTo(0.004, 6);
  });
});
