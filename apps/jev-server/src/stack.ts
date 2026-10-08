import { DEFAULT_OPENROUTER_MODEL, type ServerConfig } from "./config.js";
import type { PricingProfile } from "@jev/contracts";
import { FakeProvider } from "./providers/fake.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { OpenRouterProvider } from "./providers/openrouter.js";
import type { CompletionClient, ModelProvider } from "./providers/types.js";
import { UnavailableProvider } from "./providers/unavailable.js";
import { CLAUDE_PROFILE, GEMINI_PROFILE, GPT_PROFILE, type ScoreableModel } from "./scoring.js";

export type AnalysisStack = {
  analyst: ModelProvider;
  catalog: ScoreableModel[];
  placeholders: ModelProvider[];
  pricing?: readonly PricingProfile[];
};

export function comparisonCatalog(
  claudeAvailable: boolean,
  claudeModel = "claude-sonnet-5-5",
): ScoreableModel[] {
  return [
    {
      provider: "anthropic",
      label: "Claude",
      model: claudeModel,
      available: claudeAvailable,
      order: 0,
      profile: CLAUDE_PROFILE,
    },
    {
      provider: "openai",
      label: "GPT",
      model: "gpt",
      available: false,
      order: 1,
      profile: GPT_PROFILE,
    },
    {
      provider: "google",
      label: "Gemini",
      model: "gemini",
      available: false,
      order: 2,
      profile: GEMINI_PROFILE,
    },
  ];
}

export function createStack(config: ServerConfig, complete?: CompletionClient): AnalysisStack {
  const claudeAvailable = config.provider === "anthropic" && config.anthropicApiKey.length > 0;
  const openrouterModel = config.openrouterModel ?? DEFAULT_OPENROUTER_MODEL;
  const openrouterAvailable =
    config.provider === "openrouter" && (config.openrouterApiKey ?? "").length > 0;
  const catalog = comparisonCatalog(claudeAvailable, config.anthropicModel);
  if (config.provider === "openrouter") {
    catalog.push({
      provider: "openrouter",
      label: "OpenRouter",
      model: openrouterModel,
      available: openrouterAvailable,
      order: catalog.length,
      profile: CLAUDE_PROFILE,
    });
  }
  return {
    analyst:
      config.provider === "fake"
        ? new FakeProvider()
        : config.provider === "openrouter"
          ? new OpenRouterProvider({
              apiKey: config.openrouterApiKey ?? "",
              model: openrouterModel,
              ...(complete ? { complete } : {}),
            })
          : new AnthropicProvider({
              apiKey: config.anthropicApiKey,
              model: config.anthropicModel,
              ...(complete ? { complete } : {}),
            }),
    catalog,
    placeholders: [
      new UnavailableProvider("openai", "GPT", "gpt", GPT_PROFILE),
      new UnavailableProvider("google", "Gemini", "gemini", GEMINI_PROFILE),
    ],
  };
}
