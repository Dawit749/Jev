import { LIMITS, type CostEstimate, type ProviderUsage } from "@jev/contracts";

export type UsageRecord = {
  requestId: string;
  at: number;
  status: "completed";
  usage: ProviderUsage;
  cost?: CostEstimate;
};

/**
 * Process-local, bounded usage recording. No database and no file persistence.
 * Records hold only safe normalized metadata; never task text, source, prompts,
 * file contents, evidence, raw provider responses, or secrets.
 */
export class UsageRecorder {
  private readonly records: UsageRecord[] = [];

  constructor(private readonly capacity: number = LIMITS.maxUsageRecords) {}

  record(entry: { requestId: string; usage: ProviderUsage; cost?: CostEstimate; at?: number }): void {
    const existing = this.records.findIndex((item) => item.requestId === entry.requestId);
    if (existing !== -1) {
      this.records.splice(existing, 1);
    }
    this.records.push({
      requestId: entry.requestId,
      at: entry.at ?? Date.now(),
      status: "completed",
      usage: entry.usage,
      ...(entry.cost ? { cost: entry.cost } : {}),
    });
    while (this.records.length > this.capacity) {
      this.records.shift();
    }
  }

  has(requestId: string): boolean {
    return this.records.some((item) => item.requestId === requestId);
  }

  all(): readonly UsageRecord[] {
    return this.records;
  }

  clear(): void {
    this.records.length = 0;
  }
}
