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
 * No live provider billing APIs and no database are used. This repository does
 * not ship fabricated production prices: the default table below is intentionally
 * empty. Unknown pricing yields an unavailable cost, never a guessed value.
 *
 * To configure pricing locally, add entries to PRICING_PROFILES (or supply your
 * own table) with an explicit currency, effective date, and pricing version.
 */
export const DEFAULT_PRICING_VERSION = "v1";

export const PRICING_PROFILES: readonly PricingProfile[] = [];

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
