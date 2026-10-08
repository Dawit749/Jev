import type { ProviderFinding } from "@jev/contracts";
import type { ModelProfile } from "../scoring.js";

export type ProviderCapabilities = {
  id: string;
  label: string;
  model: string;
  available: boolean;
  profile: ModelProfile;
};

export type ProviderAnalysisInput = {
  task: string;
  workspaceName: string;
  structure: string[];
  currentFile?: { path: string; content: string };
  selection?: string;
  relevantFiles: { path: string; content: string }[];
  gitDiff?: string;
};

export type ProviderAnalysis = {
  summary: string;
  recommendation: string;
  findings: ProviderFinding[];
};

export interface ModelProvider {
  readonly id: string;
  capabilities(): ProviderCapabilities;
  analyze(input: ProviderAnalysisInput): Promise<ProviderAnalysis>;
}

export type CompletionRequest = {
  apiKey: string;
  model: string;
  system: string;
  user: string;
};

export type CompletionClient = (request: CompletionRequest) => Promise<unknown>;
