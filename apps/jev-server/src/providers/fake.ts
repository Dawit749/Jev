import type {
  ModelProvider,
  ProviderAnalysis,
  ProviderAnalysisInput,
  ProviderCapabilities,
} from "./types.js";
import { CLAUDE_PROFILE } from "../scoring.js";

export class FakeProvider implements ModelProvider {
  readonly id = "fake";

  capabilities(): ProviderCapabilities {
    return {
      id: "fake",
      label: "Local stub",
      model: "stub",
      available: true,
      profile: CLAUDE_PROFILE,
    };
  }

  analyze(input: ProviderAnalysisInput): Promise<ProviderAnalysis> {
    const affected = [
      input.currentFile?.path,
      ...input.relevantFiles.map((file) => file.path),
    ].filter((filePath): filePath is string => Boolean(filePath));
    return Promise.resolve({
      summary: "Potential architecture issue detected.",
      recommendation: "Move business rules out of the controller and into an application service.",
      findings: [
        {
          category: "architecture",
          severity: "medium",
          title: "Business logic in controller",
          description:
            "Authentication rules appear in the controller rather than an application service.",
          evidence: ["The controller contains authentication rules."],
          recommendation: "Move business logic into the application service.",
          why: "The controller path contains authentication rules, so the layering risk is visible in the supplied context.",
          uncertainty: "This is limited to the supplied project context and is not a certainty.",
          confidence: 0.86,
          affectedFiles: affected.slice(0, 3),
        },
      ],
    });
  }
}
