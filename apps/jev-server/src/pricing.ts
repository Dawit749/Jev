import {
  LIMITS,
  costEstimateSchema,
  pricingProfileSchema,
  type CostEstimate,
  type PricingProfile,
  type ProviderUsage,
} from "@jev/contracts";

/**
 * Server-side, versioned, configuration-driven pricing.
 *
 * No live provider billing APIs and no database are used. Prices are stored per
 * token (the unit `estimateCost` expects); provider prices published per million
 * tokens are converted by dividing by 1,000,000.
 *
 * Sources (verified, not invented):
 * - Anthropic official pricing: https://docs.anthropic.com/en/docs/about-claude/pricing
 *   "Claude Sonnet 5.5" listed at $2 / MTok input and $10 / MTok output.
 * - OpenRouter official models API: https://openrouter.ai/api/v1/models
 *   `openrouter/free` reports pricing.prompt = "0" and pricing.completion = "0".
 *
 * Only models the repository actually supports are listed. Models with no
 * reliable official pricing remain unpriced and therefore report cost as
 * unavailable; nothing is guessed.
 */
export const DEFAULT_PRICING_VERSION = "v1";

export const PRICING_PROFILES: readonly PricingProfile[] = [
  {
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    // $2 / MTok input -> 0.000002 per token
    inputTokenPrice: 0.000002,
    // $10 / MTok output -> 0.00001 per token
    outputTokenPrice: 0.00001,
    currency: "USD",
    effectiveDate: "2026-10-08",
    pricingVersion: "v1",
  },
  {
    provider: "openrouter",
    model: "openrouter/free",
    // The free meta-router is priced at zero by OpenRouter.
    inputTokenPrice: 0,
    outputTokenPrice: 0,
    currency: "USD",
    effectiveDate: "2026-10-08",
    pricingVersion: "v1",
  },
];

export function findPricingProfile(
  provider: string,
  model: string,
  profiles: readonly PricingProfile[] = PRICING_PROFILES,
): PricingProfile | undefined {
  const normalizedProvider = provider.trim().toLowerCase();
  const normalizedModel = model.trim().toLowerCase();
  const matches = profiles.filter(
    (profile) =>
      profile.provider.trim().toLowerCase() === normalizedProvider &&
      profile.model.trim().toLowerCase() === normalizedModel,
  );
  return matches.sort((left, right) =>
    right.effectiveDate.localeCompare(left.effectiveDate),
  )[0];
}

function roundAmount(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Estimates cost as (input tokens x input price) + (output tokens x output price).
 * Returns undefined when pricing or the required token counts are unavailable.
 * The result is always labeled estimated and carries currency and pricing version.
 */
export function estimateCost(
  usage: ProviderUsage,
  profiles: readonly PricingProfile[] = PRICING_PROFILES,
): CostEstimate | undefined {
  const profile = findPricingProfile(usage.provider, usage.model, profiles);
  if (!profile) {
    return undefined;
  }
  const { inputTokens, outputTokens } = usage;
  if (inputTokens === undefined && outputTokens === undefined) {
    return undefined;
  }
  const amount = roundAmount(
    (inputTokens ?? 0) * profile.inputTokenPrice + (outputTokens ?? 0) * profile.outputTokenPrice,
  );
  if (!Number.isFinite(amount) || amount < 0 || amount > LIMITS.maxCostAmount) {
    return undefined;
  }
  const estimate = {
    amount,
    currency: profile.currency,
    pricingVersion: profile.pricingVersion,
    estimated: true as const,
  };
  const parsed = costEstimateSchema.safeParse(estimate);
  return parsed.success ? parsed.data : undefined;
}

export function isValidPricingProfile(value: unknown): value is PricingProfile {
  return pricingProfileSchema.safeParse(value).success;
}
