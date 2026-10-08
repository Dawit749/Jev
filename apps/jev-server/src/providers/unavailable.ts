import { ProviderUnavailableError } from "../errors.js";
import type { ModelProfile } from "../scoring.js";
import type {
  ModelProvider,
  ProviderAnalysis,
  ProviderAnalysisInput,
  ProviderCapabilities,
} from "./types.js";

export class UnavailableProvider implements ModelProvider {
  constructor(
    readonly id: string,
    private readonly label: string,
    private readonly model: string,
    private readonly profile: ModelProfile,
  ) {}

  capabilities(): ProviderCapabilities {
    return {
      id: this.id,
      label: this.label,
      model: this.model,
      available: false,
      profile: this.profile,
    };
  }

  analyze(_input: ProviderAnalysisInput): Promise<ProviderAnalysis> {
    return Promise.reject(
      new ProviderUnavailableError(`${this.label} is not connected in this MVP.`),
    );
  }
}
