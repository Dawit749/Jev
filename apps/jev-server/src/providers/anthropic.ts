import Anthropic, { APIConnectionTimeoutError } from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { LIMITS, providerOutputSchema } from "@jev/contracts";
import {
  ContextLimitError,
  InvalidProviderResponseError,
  ProviderRequestError,
  ProviderTimeoutError,
  ProviderUnavailableError,
  isSafeProviderError,
  readStatus,
} from "../errors.js";
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisUserPrompt } from "../prompt.js";
import { CLAUDE_PROFILE } from "../scoring.js";
import type {
  CompletionClient,
  ModelProvider,
  ProviderAnalysis,
  ProviderAnalysisInput,
  ProviderCapabilities,
} from "./types.js";

export function createAnthropicCompletionClient(): CompletionClient {
  return async (request) => {
    const client = new Anthropic({
      apiKey: request.apiKey,
      maxRetries: 0,
      timeout: 60_000,
    });
    try {
      const message = await client.messages.parse({
        model: request.model,
        max_tokens: 4096,
        system: request.system,
        messages: [{ role: "user", content: request.user }],
        output_config: { format: zodOutputFormat(providerOutputSchema) },
      });
      if (message.parsed_output == null) {
        throw new InvalidProviderResponseError();
      }
      return message.parsed_output;
    } catch (error) {
      throw mapCompletionError(error);
    }
  };
}

export function measuredContextChars(input: ProviderAnalysisInput): number {
  let total = input.task.length + input.structure.join("").length;
  total += input.currentFile?.content.length ?? 0;
  total += input.selection?.length ?? 0;
  total += input.gitDiff?.length ?? 0;
  for (const file of input.relevantFiles) {
    total += file.content.length;
  }
  return total;
}

function mapCompletionError(error: unknown): never {
  if (isSafeProviderError(error)) {
    throw error;
  }
  if (error instanceof APIConnectionTimeoutError) {
    throw new ProviderTimeoutError();
  }
  throw new ProviderRequestError(readStatus(error));
}

export class AnthropicProvider implements ModelProvider {
  readonly id = "anthropic";

  constructor(
    private readonly options: {
      apiKey: string;
      model: string;
      complete?: CompletionClient;
    },
  ) {}

  capabilities(): ProviderCapabilities {
    return {
      id: "anthropic",
      label: "Claude",
      model: this.options.model,
      available: this.options.apiKey.length > 0,
      profile: CLAUDE_PROFILE,
    };
  }

  async analyze(input: ProviderAnalysisInput): Promise<ProviderAnalysis> {
    if (!this.capabilities().available) {
      throw new ProviderUnavailableError(
        "Claude is not configured. Add ANTHROPIC_API_KEY to the server environment and restart Jev.",
      );
    }
    if (measuredContextChars(input) > LIMITS.maxTotalContextChars) {
      throw new ContextLimitError();
    }
    const complete = this.options.complete ?? createAnthropicCompletionClient();
    let raw: unknown;
    try {
      raw = await complete({
        apiKey: this.options.apiKey,
        model: this.options.model,
        system: ANALYSIS_SYSTEM_PROMPT,
        user: buildAnalysisUserPrompt(input),
      });
    } catch (error) {
      throw mapCompletionError(error);
    }
    const parsed = providerOutputSchema.safeParse(raw);
    if (!parsed.success) {
      throw new InvalidProviderResponseError();
    }
    return parsed.data;
  }
}
