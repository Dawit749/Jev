import { LIMITS, providerUsageSchema, type ProviderUsage } from "@jev/contracts";

const MAX_TOKEN = LIMITS.maxTokenCount;

function toTokenCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    return undefined;
  }
  if (value < 0 || value > MAX_TOKEN) {
    return undefined;
  }
  return value;
}

/**
 * Normalizes provider-supplied token usage into the provider-neutral contract.
 * Missing, malformed, negative, or contradictory values become unavailable.
 * Values are never fabricated and missing counts are never converted to zero.
 */
export function normalizeUsage(input: {
  provider: string;
  model: string;
  rawUsage: unknown;
}): ProviderUsage {
  const record = readUsage(input.rawUsage);
  const inputTokens = toTokenCount(record.inputTokens);
  const outputTokens = toTokenCount(record.outputTokens);
  let totalTokens = toTokenCount(record.totalTokens);

  if (inputTokens === undefined) {
    totalTokens = undefined;
  }
  if (outputTokens === undefined) {
    totalTokens = undefined;
  }
  if (totalTokens !== undefined && inputTokens !== undefined && outputTokens !== undefined) {
    if (totalTokens !== inputTokens + outputTokens) {
      totalTokens = undefined;
    }
  }

  const normalized = {
    provider: input.provider,
    model: input.model,
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
    source: inputTokens === undefined && outputTokens === undefined ? "unavailable" : "provider",
  };

  const parsed = providerUsageSchema.safeParse(normalized);
  return parsed.success
    ? parsed.data
    : { provider: input.provider, model: input.model, source: "unavailable" };
}

export function unavailableUsage(provider: string, model: string): ProviderUsage {
  return { provider, model, source: "unavailable" };
}

/**
 * Validates usage provided by a completion client (which may already be normalized).
 * Malformed values degrade to unavailable rather than leaking.
 */
export function coerceUsage(
  provider: string,
  fallbackModel: string,
  provided: unknown,
): ProviderUsage {
  const record = provided && typeof provided === "object" ? (provided as ProviderUsage) : undefined;
  const model =
    record && typeof record.model === "string" && record.model.length > 0
      ? record.model
      : fallbackModel;
  return normalizeUsage({ provider, model, rawUsage: provided });
}

function readUsage(raw: unknown): {
  inputTokens?: unknown;
  outputTokens?: unknown;
  totalTokens?: unknown;
} {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const record = raw as Record<string, unknown>;
  return {
    inputTokens: record.inputTokens ?? record.prompt_tokens ?? record.promptTokens,
    outputTokens: record.outputTokens ?? record.completion_tokens ?? record.completionTokens,
    totalTokens: record.totalTokens ?? record.total_tokens,
  };
}
