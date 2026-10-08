import {
  LIMITS,
  providerOutputSchema,
  recommendationResponseSchema,
  type AnalysisRequest,
  type AnalysisResponse,
} from "@jev/contracts";
import { HttpError, InvalidProviderResponseError, InvalidRecommendationError } from "./errors.js";
import { publishFindings } from "./findings.js";
import type { ProviderAnalysisInput } from "./providers/types.js";
import { scoreModels, type ScoredRecommendation } from "./scoring.js";
import type { AnalysisStack } from "./stack.js";

export type ModelRecommendationInput = {
  task: string;
  contextChars: number;
  preferredProvider?: string;
};

export type ModelRecommendation = ScoredRecommendation;

export type AnalysisResult = Omit<AnalysisResponse, "requestId" | "context">;

export interface ModelRouter {
  recommend(input: ModelRecommendationInput): Promise<ModelRecommendation>;
  analyze(input: AnalysisRequest): Promise<AnalysisResult>;
}

function assertRecommendationInput(input: ModelRecommendationInput): void {
  const task = input.task.trim();
  const preferred = input.preferredProvider;
  const contextChars = input.contextChars;
  if (
    task.length === 0 ||
    task.length > LIMITS.maxTaskChars ||
    !Number.isInteger(contextChars) ||
    contextChars < 0 ||
    contextChars > LIMITS.maxTotalContextChars ||
    (preferred !== undefined && (preferred.length === 0 || preferred.length > 40))
  ) {
    throw new HttpError(400, "INVALID_CONTEXT", "The model recommendation input is invalid.");
  }
}

function estimateContextChars(input: AnalysisRequest): number {
  let total = input.task.length + input.workspace.structure.join("").length;
  total += input.currentFile?.content.length ?? 0;
  total += input.selection?.content.length ?? 0;
  total += input.gitDiff?.length ?? 0;
  for (const file of input.relevantFiles ?? []) {
    total += file.content.length;
  }
  return total;
}

function toProviderInput(input: AnalysisRequest): ProviderAnalysisInput {
  return {
    task: input.task,
    workspaceName: input.workspace.name,
    structure: input.workspace.structure,
    ...(input.currentFile
      ? { currentFile: { path: input.currentFile.path, content: input.currentFile.content } }
      : {}),
    ...(input.selection ? { selection: input.selection.content } : {}),
    relevantFiles: input.relevantFiles ?? [],
    ...(input.gitDiff ? { gitDiff: input.gitDiff } : {}),
  };
}

export class JevModelRouter implements ModelRouter {
  constructor(private readonly stack: AnalysisStack) {}

  async recommend(input: ModelRecommendationInput): Promise<ModelRecommendation> {
    assertRecommendationInput(input);
    let scored: ScoredRecommendation;
    try {
      scored = scoreModels({
        task: input.task.trim(),
        contextChars: input.contextChars,
        ...(input.preferredProvider ? { preferredProvider: input.preferredProvider } : {}),
        models: this.stack.catalog,
      });
    } catch {
      throw new InvalidRecommendationError();
    }
    const parsed = recommendationResponseSchema.safeParse({
      requestId: "req_local",
      modelRecommendation: scored.primary,
      alternatives: scored.alternatives,
      taskClassification: scored.taskClassification,
      factors: scored.factors,
      fitDisclaimer: scored.fitDisclaimer,
    });
    if (!parsed.success) {
      throw new InvalidRecommendationError();
    }
    return Promise.resolve({
      primary: parsed.data.modelRecommendation,
      alternatives: parsed.data.alternatives,
      taskClassification: parsed.data.taskClassification,
      factors: parsed.data.factors,
      fitDisclaimer: parsed.data.fitDisclaimer,
    });
  }

  async analyze(input: AnalysisRequest): Promise<AnalysisResult> {
    const recommendation = await this.recommend({
      task: input.task,
      contextChars: estimateContextChars(input),
      ...(input.preferredProvider ? { preferredProvider: input.preferredProvider } : {}),
    });
    const raw = await this.stack.analyst.analyze(toProviderInput(input));
    const parsed = providerOutputSchema.safeParse(raw);
    if (!parsed.success) {
      throw new InvalidProviderResponseError();
    }
    const findings = publishFindings(parsed.data.findings, input);
    const capabilities = this.stack.analyst.capabilities();
    return {
      modelRecommendation: recommendation.primary,
      alternatives: recommendation.alternatives,
      taskClassification: recommendation.taskClassification,
      factors: recommendation.factors,
      fitDisclaimer: recommendation.fitDisclaimer,
      analysisProvider: {
        provider: capabilities.id,
        model: capabilities.model,
        label: capabilities.label,
      },
      summary: parsed.data.summary,
      recommendation: parsed.data.recommendation,
      findings,
    };
  }
}
