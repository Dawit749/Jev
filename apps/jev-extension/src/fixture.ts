import { FIT_DISCLAIMER, type AnalysisRequest, type AnalysisResponse } from "@jev/contracts";
import type { PrepareResult } from "./context/prepare";

export function sampleRequest(): AnalysisRequest {
  return {
    task: "Review the authentication change for architecture issues",
    workspace: {
      name: "sample-auth",
      language: "typescript",
      structure: ["src/api/authController.ts"],
    },
    currentFile: {
      path: "src/api/authController.ts",
      content: "export function login() { return true; }",
    },
    client: { ide: "vscode", version: "1.90.0" },
  };
}

export function sampleResponse(): AnalysisResponse {
  return {
    requestId: "req_test",
    modelRecommendation: {
      provider: "anthropic",
      model: "claude",
      label: "Claude",
      score: 0.91,
      reasons: ["High reasoning need"],
      available: true,
      fitStatement:
        "Jev estimates Claude is a strong fit for this task. Fit score: 91%. This is Jev's internal recommendation score, not a benchmark.",
    },
    alternatives: [
      {
        provider: "openai",
        model: "gpt",
        label: "GPT",
        score: 0.8,
        reasons: ["Not connected"],
        available: false,
        fitStatement:
          "GPT is not connected. Fit score: 80%. This is Jev's internal recommendation score, not a benchmark.",
      },
    ],
    taskClassification: { kind: "architecture", label: "Complex architecture task" },
    factors: [
      { id: "complexity", label: "Task complexity", weight: 0.2, signal: 0.7 },
      { id: "reasoning", label: "Reasoning requirement", weight: 0.2, signal: 0.85 },
      { id: "context", label: "Context size", weight: 0.13, signal: 0.1 },
      { id: "coding", label: "Coding requirement", weight: 0.15, signal: 0.4 },
      { id: "speed", label: "Speed", weight: 0.12, signal: 0.1 },
      { id: "cost", label: "Cost", weight: 0.12, signal: 0.1 },
      { id: "privacy", label: "Privacy", weight: 0.08, signal: 0 },
      { id: "availability", label: "Provider availability", weight: 0, signal: 0.33 },
    ],
    fitDisclaimer: FIT_DISCLAIMER,
    analysisProvider: { provider: "anthropic", model: "claude-sonnet-5-5", label: "Claude" },
    summary: "Potential architecture issue detected.",
    recommendation: "Move business logic into the application service.",
    findings: [
      {
        id: "f1",
        category: "architecture",
        severity: "medium",
        title: "Business logic in controller",
        description: "Authentication rules appear in the controller.",
        evidence: ["AuthController contains authentication rules"],
        recommendation: "Move business logic into the application service.",
        why: "The controller owns rules that belong in the application layer.",
        uncertainty: "This is limited to the supplied project context and is not a certainty.",
        confidence: 0.89,
        affectedFiles: ["src/api/authController.ts"],
      },
    ],
    context: { includedFiles: ["src/api/authController.ts"], narrowed: false },
    usage: {
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      inputTokens: 12_450,
      outputTokens: 2_180,
      totalTokens: 14_630,
      source: "provider",
    },
    cost: { amount: 0.042, currency: "USD", pricingVersion: "v1", estimated: true },
  };
}

export function samplePrepared(): PrepareResult {
  return { request: sampleRequest(), narrowed: false, excludedSensitive: false };
}
