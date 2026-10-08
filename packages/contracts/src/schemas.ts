import { z } from "zod/v4";
import { LIMITS } from "./limits.js";

export const findingCategorySchema = z.enum([
  "architecture",
  "security",
  "maintainability",
  "dependency",
  "api",
  "compatibility",
  "performance",
  "code_quality",
]);

export const findingTypeSchema = findingCategorySchema;

export const severitySchema = z.enum(["info", "low", "medium", "high", "critical"]);

export const providerFindingSchema = z.object({
  category: findingCategorySchema,
  severity: severitySchema,
  title: z.string().min(1).max(LIMITS.maxTitleChars),
  description: z.string().min(1).max(LIMITS.maxDescriptionChars),
  evidence: z
    .array(z.string().min(1).max(LIMITS.maxEvidenceChars))
    .min(1)
    .max(LIMITS.maxEvidenceItems),
  recommendation: z.string().min(1).max(1_000),
  why: z.string().min(1).max(LIMITS.maxWhyChars),
  uncertainty: z.string().min(1).max(LIMITS.maxUncertaintyChars),
  confidence: z.number().min(0).max(1),
  affectedFiles: z.array(z.string().min(1).max(LIMITS.maxPathChars)).max(LIMITS.maxAffectedFiles),
});

export const findingSchema = providerFindingSchema.extend({
  id: z.string().regex(/^f[1-8]$/),
});

export const FIT_DISCLAIMER =
  "Fit scores are Jev's internal recommendation scores, not universal benchmarks.";

export const taskKindSchema = z.enum([
  "simple_coding",
  "architecture",
  "large_context",
  "reasoning",
  "speed",
  "cost",
  "coding",
  "general",
]);

export const taskClassificationSchema = z.object({
  kind: taskKindSchema,
  label: z.string().min(1).max(80),
});

export const recommendationFactorSchema = z.object({
  id: z.enum([
    "complexity",
    "reasoning",
    "context",
    "coding",
    "speed",
    "cost",
    "privacy",
    "availability",
  ]),
  label: z.string().min(1).max(80),
  weight: z.number().min(0).max(1),
  signal: z.number().min(0).max(1),
});

export const modelScoreSchema = z.object({
  provider: z.string().min(1).max(40),
  model: z.string().min(1).max(80),
  label: z.string().min(1).max(40),
  score: z.number().min(0).max(1),
  reasons: z.array(z.string().min(1).max(LIMITS.maxReasonChars)).min(1).max(LIMITS.maxReasons),
  available: z.boolean(),
  fitStatement: z.string().min(1).max(320),
});

export const clientSchema = z.object({
  ide: z.literal("vscode"),
  version: z.string().min(1).max(40),
});

export const analysisRequestSchema = z.object({
  task: z.string().trim().min(1).max(LIMITS.maxTaskChars),
  workspace: z.object({
    name: z.string().trim().min(1).max(200),
    language: z.string().trim().min(1).max(40).optional(),
    structure: z
      .array(z.string().min(1).max(LIMITS.maxStructureEntryChars))
      .max(LIMITS.maxStructureEntries),
  }),
  currentFile: z
    .object({
      path: z.string().min(1).max(LIMITS.maxPathChars),
      content: z.string().max(LIMITS.maxFileChars),
      languageId: z.string().min(1).max(40).optional(),
    })
    .optional(),
  selection: z
    .object({
      content: z.string().max(LIMITS.maxSelectionChars),
    })
    .optional(),
  relevantFiles: z
    .array(
      z.object({
        path: z.string().min(1).max(LIMITS.maxPathChars),
        content: z.string().max(LIMITS.maxRelevantFileChars),
      }),
    )
    .max(LIMITS.maxRelevantFiles)
    .optional(),
  gitDiff: z.string().max(LIMITS.maxGitDiffChars).optional(),
  contextNarrowed: z.boolean().optional(),
  preferredProvider: z.string().min(1).max(40).optional(),
  client: clientSchema,
});

export const analysisProviderSchema = z.object({
  provider: z.string().min(1).max(40),
  model: z.string().min(1).max(80),
  label: z.string().min(1).max(40),
});

export const usageSourceSchema = z.enum(["provider", "estimated", "unavailable"]);

export const providerUsageSchema = z.object({
  provider: z.string().min(1).max(40),
  model: z.string().min(1).max(80),
  inputTokens: z.number().int().nonnegative().max(LIMITS.maxTokenCount).optional(),
  outputTokens: z.number().int().nonnegative().max(LIMITS.maxTokenCount).optional(),
  totalTokens: z.number().int().nonnegative().max(LIMITS.maxTokenCount).optional(),
  source: usageSourceSchema,
});

export const costEstimateSchema = z.object({
  amount: z.number().nonnegative().max(LIMITS.maxCostAmount).optional(),
  currency: z.string().min(1).max(10),
  pricingVersion: z.string().min(1).max(40),
  estimated: z.literal(true),
  note: z.string().min(1).max(200).optional(),
});

export const pricingProfileSchema = z.object({
  provider: z.string().min(1).max(40),
  model: z.string().min(1).max(80),
  inputTokenPrice: z.number().nonnegative().max(LIMITS.maxTokenPrice),
  outputTokenPrice: z.number().nonnegative().max(LIMITS.maxTokenPrice),
  currency: z.string().min(1).max(10),
  effectiveDate: z.string().min(1).max(40),
  pricingVersion: z.string().min(1).max(40),
});

export const analysisResponseSchema = z.object({
  requestId: z.string().min(1).max(80),
  modelRecommendation: modelScoreSchema,
  alternatives: z.array(modelScoreSchema).max(6),
  taskClassification: taskClassificationSchema,
  factors: z.array(recommendationFactorSchema).min(1).max(8),
  fitDisclaimer: z.literal(FIT_DISCLAIMER),
  analysisProvider: analysisProviderSchema,
  summary: z.string().min(1).max(LIMITS.maxSummaryChars),
  recommendation: z.string().min(1).max(LIMITS.maxSummaryChars),
  findings: z.array(findingSchema).max(LIMITS.maxFindings),
  context: z.object({
    includedFiles: z.array(z.string().min(1).max(LIMITS.maxPathChars)).max(20),
    narrowed: z.boolean(),
  }),
  usage: providerUsageSchema.optional(),
  cost: costEstimateSchema.optional(),
});

export const recommendationRequestSchema = z.object({
  task: z.string().trim().min(1).max(LIMITS.maxTaskChars),
  contextChars: z.number().int().nonnegative().max(LIMITS.maxTotalContextChars).optional(),
  preferredProvider: z.string().min(1).max(40).optional(),
  client: clientSchema,
});

export const recommendationResponseSchema = z.object({
  requestId: z.string().min(1).max(80),
  modelRecommendation: modelScoreSchema,
  alternatives: z.array(modelScoreSchema).max(6),
  taskClassification: taskClassificationSchema,
  factors: z.array(recommendationFactorSchema).min(1).max(8),
  fitDisclaimer: z.literal(FIT_DISCLAIMER),
});

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string().min(1).max(80),
    message: z.string().min(1).max(300),
  }),
});

export const providerOutputSchema = z.object({
  summary: z.string().min(1).max(LIMITS.maxSummaryChars),
  recommendation: z.string().min(1).max(LIMITS.maxSummaryChars),
  findings: z.array(providerFindingSchema).max(LIMITS.maxFindings),
});

export type ProviderFinding = z.infer<typeof providerFindingSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type FindingCategory = z.infer<typeof findingCategorySchema>;
export type FindingType = FindingCategory;
export type Severity = z.infer<typeof severitySchema>;
export type TaskKind = z.infer<typeof taskKindSchema>;
export type TaskClassification = z.infer<typeof taskClassificationSchema>;
export type RecommendationFactor = z.infer<typeof recommendationFactorSchema>;
export type ModelScore = z.infer<typeof modelScoreSchema>;
export type AnalysisRequest = z.infer<typeof analysisRequestSchema>;
export type AnalysisResponse = z.infer<typeof analysisResponseSchema>;
export type RecommendationRequest = z.infer<typeof recommendationRequestSchema>;
export type RecommendationResponse = z.infer<typeof recommendationResponseSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type ProviderOutput = z.infer<typeof providerOutputSchema>;
export type UsageSource = z.infer<typeof usageSourceSchema>;
export type ProviderUsage = z.infer<typeof providerUsageSchema>;
export type CostEstimate = z.infer<typeof costEstimateSchema>;
export type PricingProfile = z.infer<typeof pricingProfileSchema>;
