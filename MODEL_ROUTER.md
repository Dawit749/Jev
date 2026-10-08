# Jev MVP v0.1 — Model Router

## Purpose

The model router separates Jev's product logic from any individual model provider.

## Interface

```ts
interface ModelProvider {
  id: string;
  capabilities(): ProviderCapabilities;
  analyze(input: ProviderAnalysisInput): Promise<ProviderAnalysisResult>;
}

interface ModelRouter {
  recommend(input: ModelRecommendationInput): Promise<ModelRecommendation>;
  analyze(input: AnalysisInput): Promise<AnalysisResult>;
}
```

## Initial providers

- Anthropic (Claude) — the default reasoning provider.
- OpenRouter — an optional, cost-conscious path selected with `JEV_PROVIDER=openrouter`.

Both implement the same provider-neutral interface, so the UI describes the analysis using whichever provider is configured and does not depend on either one.

## Future providers

OpenAI, Google, and others may be added without changing Jev UI contracts.

## Recommendation factors

- Task complexity
- Reasoning requirement
- Context size
- Coding requirement
- Latency preference
- Cost preference
- Available provider
- User preference

## Important distinction

A model fit score is Jev's internal recommendation score.

It is NOT:
- a benchmark score
- a claim that one provider is universally better
- a guarantee of output quality

## MVP behavior

The first version may use a deterministic scoring policy plus Claude analysis.

Example:

```text
High reasoning + large context + architecture
→ favor Claude

Simple explanation + low complexity
→ favor lower-cost/fast option

Unknown
→ ask user or provide conservative recommendation
```

Do not pretend the router can invoke providers for which credentials/integration do not exist.

## Automatic switching

Not MVP.

The router may recommend:
- "Use Claude"
- "Use GPT"
- "Use Gemini"

Actual automatic switching depends on the host environment and supported APIs.
