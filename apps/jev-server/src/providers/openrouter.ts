import { LIMITS, providerOutputSchema, type ProviderUsage } from "@jev/contracts";
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
import { normalizeUsage, coerceUsage } from "../usage.js";
import type {
  CompletionClient,
  ModelProvider,
  ProviderAnalysis,
  ProviderAnalysisInput,
  ProviderCapabilities,
} from "./types.js";

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "openrouter/free";
const REQUEST_TIMEOUT_MS = 60_000;

const JSON_OUTPUT_INSTRUCTION = [
  "Return a single JSON object with these exact fields and no other text:",
  '{"summary": string, "recommendation": string, "findings": [{"category": string, "severity": string, "title": string, "description": string, "evidence": string[], "recommendation": string, "why": string, "uncertainty": string, "confidence": number, "affectedFiles": string[]}]}.',
  "Use lowercase values for category and severity fields.",
  "Output only the JSON object, without markdown code fences.",
].join("\n");

const OPENROUTER_SYSTEM_PROMPT = `${ANALYSIS_SYSTEM_PROMPT}\n\n${JSON_OUTPUT_INSTRUCTION}`;

export function createOpenRouterCompletionClient(): CompletionClient {
  return async (request) => {
    let response: Response;
    try {
      response = await fetch(`${OPENROUTER_ENDPOINT}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${request.apiKey}`,
        },
        body: JSON.stringify({
          model: request.model,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw mapOpenRouterError(error);
    }
    const payload = await readJsonSafe(response);
    if (!response.ok) {
      throw new ProviderRequestError(response.status, openRouterErrorMessage(response.status));
    }
    const content = extractMessageContent(payload);
    if (content == null) {
      throw new InvalidProviderResponseError();
    }
    let output: unknown;
    try {
      output = JSON.parse(stripCodeFences(content)) as unknown;
    } catch {
      throw new InvalidProviderResponseError();
    }
    const resolvedModel = extractResolvedModel(payload) ?? request.model;
    const usage = normalizeUsage({
      provider: "openrouter",
      model: resolvedModel,
      rawUsage: extractUsage(payload),
    });
    return { output, usage };
  };
}

export class OpenRouterProvider implements ModelProvider {
  readonly id = "openrouter";

  constructor(
    private readonly options: {
      apiKey: string;
      model?: string;
      complete?: CompletionClient;
    },
  ) {}

  capabilities(): ProviderCapabilities {
    return {
      id: "openrouter",
      label: "OpenRouter",
      model: this.options.model ?? DEFAULT_MODEL,
      available: this.options.apiKey.length > 0,
      profile: CLAUDE_PROFILE,
    };
  }

  async analyze(input: ProviderAnalysisInput): Promise<ProviderAnalysis> {
    if (!this.capabilities().available) {
      throw new ProviderUnavailableError(
        "OpenRouter is not configured. Add OPENROUTER_API_KEY to the server environment and restart Jev.",
      );
    }
    if (measuredContextChars(input) > LIMITS.maxTotalContextChars) {
      throw new ContextLimitError();
    }
    const complete = this.options.complete ?? createOpenRouterCompletionClient();
    let raw: unknown;
    try {
      raw = await complete({
        apiKey: this.options.apiKey,
        model: this.options.model ?? DEFAULT_MODEL,
        system: OPENROUTER_SYSTEM_PROMPT,
        user: buildAnalysisUserPrompt(input),
      });
    } catch (error) {
      throw mapOpenRouterError(error);
    }
    const { output, usage } = splitCompletion(raw, this.options.model ?? DEFAULT_MODEL);
    const parsed = providerOutputSchema.safeParse(normalizeProviderOutput(output));
    if (!parsed.success) {
      throw new InvalidProviderResponseError();
    }
    return usage ? { ...parsed.data, usage } : parsed.data;
  }
}

function splitCompletion(
  raw: unknown,
  fallbackModel: string,
): { output: unknown; usage?: ProviderUsage } {
  if (
    raw &&
    typeof raw === "object" &&
    "output" in raw &&
    !("findings" in (raw as Record<string, unknown>))
  ) {
    const record = raw as { output: unknown; usage?: ProviderUsage };
    return { output: record.output, usage: coerceUsage("openrouter", fallbackModel, record.usage) };
  }
  return { output: raw };
}

function measuredContextChars(input: ProviderAnalysisInput): number {
  let total = input.task.length + input.structure.join("").length;
  total += input.currentFile?.content.length ?? 0;
  total += input.selection?.length ?? 0;
  total += input.gitDiff?.length ?? 0;
  for (const file of input.relevantFiles) {
    total += file.content.length;
  }
  return total;
}

function normalizeProviderOutput(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") {
    return raw;
  }
  const record = raw as { findings?: unknown };
  if (!Array.isArray(record.findings)) {
    return raw;
  }
  return {
    ...record,
    findings: record.findings.map((item) => {
      if (!item || typeof item !== "object") {
        return item;
      }
      const finding = item as Record<string, unknown>;
      return {
        ...finding,
        ...(typeof finding.category === "string"
          ? { category: finding.category.toLowerCase() }
          : {}),
        ...(typeof finding.severity === "string"
          ? { severity: finding.severity.toLowerCase() }
          : {}),
      };
    }),
  };
}

function mapOpenRouterError(error: unknown): never {
  if (isSafeProviderError(error)) {
    throw error;
  }
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    throw new ProviderTimeoutError();
  }
  throw new ProviderRequestError(readStatus(error));
}

function openRouterErrorMessage(status: number | undefined): string {
  if (status === 401 || status === 403) {
    return "The analysis provider rejected the server credentials. Check OPENROUTER_API_KEY.";
  }
  if (status === 404) {
    return "The configured model was not found. Check OPENROUTER_MODEL.";
  }
  if (status === 429) {
    return "The analysis provider is rate limiting requests. Wait and try again.";
  }
  return "The analysis provider could not complete the request.";
}

function extractMessageContent(payload: unknown): string | undefined {
  const choices = readChoices(payload);
  if (!choices) {
    return undefined;
  }
  const first = choices[0];
  if (!first || typeof first !== "object") {
    return undefined;
  }
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    return undefined;
  }
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content : undefined;
}

function extractResolvedModel(payload: unknown): string | undefined {
  if (payload && typeof payload === "object") {
    const model = (payload as { model?: unknown }).model;
    if (typeof model === "string" && model.length > 0) {
      return model;
    }
  }
  const choices = readChoices(payload);
  const first = choices?.[0];
  if (first && typeof first === "object") {
    const model = (first as { model?: unknown }).model;
    if (typeof model === "string" && model.length > 0) {
      return model;
    }
  }
  return undefined;
}

function extractUsage(payload: unknown): unknown {
  if (payload && typeof payload === "object") {
    return (payload as { usage?: unknown }).usage;
  }
  return undefined;
}

function readChoices(payload: unknown): unknown[] | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const choices = (payload as { choices?: unknown }).choices;
  return Array.isArray(choices) && choices.length > 0 ? choices : undefined;
}

function stripCodeFences(content: string): string {
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/.exec(trimmed);
  return fenced?.[1] ?? trimmed;
}

async function readJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
