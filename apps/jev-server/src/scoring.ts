import {
  FIT_DISCLAIMER,
  type ModelScore,
  type RecommendationFactor,
  type TaskClassification,
  type TaskKind,
} from "@jev/contracts";
import { clamp01 } from "@jev/shared";

export const SCORE_WEIGHTS = {
  complexity: 0.2,
  reasoning: 0.2,
  context: 0.13,
  coding: 0.15,
  speed: 0.12,
  cost: 0.12,
  privacy: 0.08,
} as const;

export const FIT_SCORE_MEANING = FIT_DISCLAIMER;

export type ModelProfile = {
  complexity: number;
  reasoning: number;
  context: number;
  coding: number;
  speed: number;
  cost: number;
  privacy: number;
};

export const CLAUDE_PROFILE: ModelProfile = {
  complexity: 0.9,
  reasoning: 0.92,
  context: 0.88,
  coding: 0.9,
  speed: 0.4,
  cost: 0.35,
  privacy: 0.5,
};

export const GPT_PROFILE: ModelProfile = {
  complexity: 0.72,
  reasoning: 0.75,
  context: 0.7,
  coding: 0.82,
  speed: 0.68,
  cost: 0.55,
  privacy: 0.5,
};

export const GEMINI_PROFILE: ModelProfile = {
  complexity: 0.4,
  reasoning: 0.5,
  context: 0.72,
  coding: 0.62,
  speed: 0.88,
  cost: 0.84,
  privacy: 0.5,
};

const ARCHITECTURE_TERMS = ["architect", "refactor", "migrat", "coupling", "boundary", "duplicat"];

const REASONING_TERMS = [
  ...ARCHITECTURE_TERMS,
  "design",
  "breaking",
  "security",
  "trade-off",
  "tradeoff",
];

const CODING_TERMS = [
  "implement",
  "bug",
  "fix",
  "function",
  "code",
  "test",
  "api",
  "type",
  "refactor",
];

const SIMPLE_TERMS = ["typo", "rename", "format", "spell", "comment", "what does", "explain this"];

const SPEED_TERMS = ["fast", "quick", "quickly", "latency", "asap", "speed"];

const COST_TERMS = ["cheap", "cheaper", "low-cost", "low cost", "budget", "inexpensive", "cost"];

const PRIVACY_TERMS = ["secret", "credential", "password", "private key", "pii"];

const KIND_LABELS: Record<TaskKind, string> = {
  simple_coding: "Simple coding task",
  architecture: "Complex architecture task",
  large_context: "Large-context task",
  reasoning: "Reasoning-heavy task",
  speed: "Speed-sensitive task",
  cost: "Cost-sensitive task",
  coding: "Coding task",
  general: "General task",
};

export type TaskSignals = {
  complexity: number;
  reasoning: number;
  contextSize: number;
  coding: number;
  speedNeed: number;
  costSensitivity: number;
  privacyNeed: number;
};

export type ScoreableModel = {
  provider: string;
  label: string;
  model: string;
  available: boolean;
  order: number;
  profile: ModelProfile;
};

export type ScoredRecommendation = {
  primary: ModelScore;
  alternatives: ModelScore[];
  taskClassification: TaskClassification;
  factors: RecommendationFactor[];
  fitDisclaimer: typeof FIT_DISCLAIMER;
};

export function classifyTask(task: string, contextChars: number): TaskSignals & TaskClassification {
  const text = task.toLowerCase();
  const count = (terms: readonly string[]) => terms.filter((term) => text.includes(term)).length;
  const reasoningHits = count(REASONING_TERMS);
  const architectureHits = count(ARCHITECTURE_TERMS);
  const codingHits = count(CODING_TERMS);
  const simpleHits = count(SIMPLE_TERMS);
  const speedHits = count(SPEED_TERMS);
  const costHits = count(COST_TERMS);
  const privacyHits = count(PRIVACY_TERMS);
  const reasoning = clamp01(
    Math.min(1, reasoningHits * 0.45) + (reasoningHits > 0 ? 0.4 : 0.1) - simpleHits * 0.5,
  );
  const coding = clamp01(codingHits * 0.35 + (reasoningHits > 0 ? 0.35 : 0.15));
  const signals: TaskSignals = {
    complexity: clamp01(reasoning * 0.75 + coding * 0.25 - simpleHits * 0.4),
    reasoning,
    contextSize: clamp01(contextChars / 50_000),
    coding,
    speedNeed: clamp01(0.15 + simpleHits * 0.25 + speedHits * 0.45 - reasoningHits * 0.2),
    costSensitivity: clamp01(0.15 + simpleHits * 0.2 + costHits * 0.5 - reasoningHits * 0.15),
    privacyNeed: clamp01(privacyHits * 0.6),
  };
  const kind = classifyKind(signals, {
    architectureHits,
    simpleHits,
    speedHits,
    costHits,
    codingHits,
  });
  return { ...signals, kind, label: KIND_LABELS[kind] };
}

function classifyKind(
  signals: TaskSignals,
  hits: {
    architectureHits: number;
    simpleHits: number;
    speedHits: number;
    costHits: number;
    codingHits: number;
  },
): TaskKind {
  if (signals.contextSize >= 0.6) {
    return "large_context";
  }
  if (hits.architectureHits > 0 && signals.reasoning >= 0.7) {
    return "architecture";
  }
  if (signals.reasoning >= 0.7) {
    return "reasoning";
  }
  if (hits.speedHits > hits.costHits && signals.speedNeed >= 0.55) {
    return "speed";
  }
  if (hits.costHits > 0 && signals.costSensitivity >= 0.55) {
    return "cost";
  }
  if (hits.simpleHits > 0) {
    return "simple_coding";
  }
  if (hits.codingHits > 0 || signals.coding >= 0.45) {
    return "coding";
  }
  return "general";
}

function alignment(signal: number, strength: number): number {
  return 1 - Math.abs(signal - strength);
}

export function fitScore(signals: TaskSignals, profile: ModelProfile): number {
  return (
    SCORE_WEIGHTS.complexity * alignment(signals.complexity, profile.complexity) +
    SCORE_WEIGHTS.reasoning * alignment(signals.reasoning, profile.reasoning) +
    SCORE_WEIGHTS.context * alignment(signals.contextSize, profile.context) +
    SCORE_WEIGHTS.coding * alignment(signals.coding, profile.coding) +
    SCORE_WEIGHTS.speed * alignment(signals.speedNeed, profile.speed) +
    SCORE_WEIGHTS.cost * alignment(signals.costSensitivity, profile.cost) +
    SCORE_WEIGHTS.privacy * alignment(signals.privacyNeed, profile.privacy)
  );
}

export function fitStatement(score: number, label: string, available: boolean): string {
  const percent = Math.round(score * 100);
  const meaning = "This is Jev's internal recommendation score, not a benchmark.";
  if (!available) {
    return `${label} is not connected. Fit score: ${percent}%. ${meaning}`;
  }
  if (score >= 0.7) {
    return `Jev estimates ${label} is a strong fit for this task. Fit score: ${percent}%. ${meaning}`;
  }
  return `Jev estimates ${label} is a reasonable connected fit for this task. Fit score: ${percent}%. ${meaning}`;
}

function reasonsFor(signals: TaskSignals, profile: ModelProfile, available: boolean): string[] {
  const reasons: string[] = [];
  if (signals.reasoning >= 0.7 && profile.reasoning >= 0.8) {
    reasons.push("High reasoning need");
  }
  if (signals.contextSize >= 0.6 && profile.context >= 0.8) {
    reasons.push("Large project context");
  }
  if (signals.coding >= 0.6 && profile.coding >= 0.8) {
    reasons.push("Coding-heavy task");
  }
  if (signals.speedNeed >= 0.7 && profile.speed >= 0.75) {
    reasons.push("Faster option for a simpler task");
  }
  if (signals.costSensitivity >= 0.7 && profile.cost >= 0.7) {
    reasons.push("Lower-cost fit");
  }
  if (signals.privacyNeed >= 0.6) {
    reasons.push("Privacy-sensitive task; only minimized context should be sent");
  }
  if (!available) {
    reasons.push("Not connected");
  }
  if (reasons.length === 0) {
    reasons.push(available ? "Best connected fit" : "Balanced fit for this task");
  }
  return reasons.slice(0, 6);
}

export function scoreModels(input: {
  task: string;
  contextChars: number;
  preferredProvider?: string;
  models: readonly ScoreableModel[];
}): ScoredRecommendation {
  const signals = classifyTask(input.task, input.contextChars);
  const ranked = input.models
    .map((model, index) => {
      const boosted = clamp01(
        fitScore(signals, model.profile) + (input.preferredProvider === model.provider ? 0.05 : 0),
      );
      const score = Math.round(boosted * 100) / 100;
      return {
        provider: model.provider,
        model: model.model,
        label: model.label,
        score,
        reasons: reasonsFor(signals, model.profile, model.available),
        available: model.available,
        fitStatement: fitStatement(score, model.label, model.available),
        order: model.order,
        index,
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        Number(right.available) - Number(left.available) ||
        left.order - right.order ||
        left.index - right.index,
    );

  const connected = ranked.filter((entry) => entry.available);
  const primary = connected[0] ?? ranked[0];
  if (!primary) {
    throw new Error("At least one model profile is required.");
  }
  const availableCount = input.models.filter((model) => model.available).length;
  return {
    primary: toModelScore(primary),
    alternatives: ranked.filter((entry) => entry !== primary).map((entry) => toModelScore(entry)),
    taskClassification: { kind: signals.kind, label: signals.label },
    factors: factorsFor(signals, availableCount, input.models.length),
    fitDisclaimer: FIT_DISCLAIMER,
  };
}

function factorsFor(
  signals: TaskSignals,
  availableCount: number,
  modelCount: number,
): RecommendationFactor[] {
  const availability = modelCount === 0 ? 0 : availableCount / modelCount;
  return [
    {
      id: "complexity",
      label: "Task complexity",
      weight: SCORE_WEIGHTS.complexity,
      signal: signals.complexity,
    },
    {
      id: "reasoning",
      label: "Reasoning requirement",
      weight: SCORE_WEIGHTS.reasoning,
      signal: signals.reasoning,
    },
    {
      id: "context",
      label: "Context size",
      weight: SCORE_WEIGHTS.context,
      signal: signals.contextSize,
    },
    {
      id: "coding",
      label: "Coding requirement",
      weight: SCORE_WEIGHTS.coding,
      signal: signals.coding,
    },
    { id: "speed", label: "Speed", weight: SCORE_WEIGHTS.speed, signal: signals.speedNeed },
    { id: "cost", label: "Cost", weight: SCORE_WEIGHTS.cost, signal: signals.costSensitivity },
    { id: "privacy", label: "Privacy", weight: SCORE_WEIGHTS.privacy, signal: signals.privacyNeed },
    {
      id: "availability",
      label: "Provider availability",
      weight: 0,
      signal: Math.round(availability * 100) / 100,
    },
  ];
}

function toModelScore(entry: {
  provider: string;
  model: string;
  label: string;
  score: number;
  reasons: string[];
  available: boolean;
  fitStatement: string;
}): ModelScore {
  return {
    provider: entry.provider,
    model: entry.model,
    label: entry.label,
    score: entry.score,
    reasons: entry.reasons,
    available: entry.available,
    fitStatement: entry.fitStatement,
  };
}
