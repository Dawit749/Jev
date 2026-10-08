import { request as httpRequest } from "node:http";
import { describe, expect, it } from "vitest";
import type { PricingProfile, ProviderUsage } from "@jev/contracts";
import { startJevServer } from "./app.js";
import { createSafeLogger } from "./log.js";
import type { ModelProvider, ProviderAnalysis } from "./providers/types.js";
import { CLAUDE_PROFILE } from "./scoring.js";
import { createStack, type AnalysisStack } from "./stack.js";
import { UsageRecorder } from "./usageRecord.js";

const config = {
  host: "127.0.0.1",
  port: 0,
  provider: "fake" as const,
  anthropicApiKey: "",
  anthropicModel: "claude-sonnet-5-5",
};

const body = {
  task: "Review the authentication change for architecture issues",
  workspace: { name: "sample-auth", structure: ["example.ts"] },
  currentFile: { path: "example.ts", content: "export function login() {}" },
  client: { ide: "vscode", version: "0.1.0" },
};

const pricing: PricingProfile[] = [
  {
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    inputTokenPrice: 0.000003,
    outputTokenPrice: 0.000015,
    currency: "USD",
    effectiveDate: "2026-01-01",
    pricingVersion: "v1",
  },
];

function analystWith(usage: ProviderUsage | undefined, fail = false): ModelProvider {
  return {
    id: "anthropic",
    capabilities: () => ({
      id: "anthropic",
      label: "Claude",
      model: "claude-sonnet-5-5",
      available: true,
      profile: CLAUDE_PROFILE,
    }),
    analyze: (): Promise<ProviderAnalysis> => {
      if (fail) {
        return Promise.reject(new Error("provider failed"));
      }
      const analysis: ProviderAnalysis = {
        summary: "Potential architecture issue detected.",
        recommendation: "Move the logic.",
        findings: [
          {
            category: "architecture",
            severity: "medium",
            title: "Business logic in controller",
            description: "Authentication rules appear in the controller.",
            evidence: ["The controller contains authentication rules."],
            uncertainty: "Limited to the supplied context.",
            confidence: 0.8,
            affectedFiles: ["example.ts"],
            recommendation: "Move the rules.",
            why: "The controller path contains authentication rules.",
          },
        ],
      };
      return Promise.resolve(usage ? { ...analysis, usage } : analysis);
    },
  };
}

function stackWith(analyst: ModelProvider, withPricing: boolean): AnalysisStack {
  const stack = { ...createStack(config), analyst };
  return withPricing ? { ...stack, pricing } : stack;
}

async function withServer(
  stack: AnalysisStack,
  run: (url: string, usage: UsageRecorder) => Promise<void>,
) {
  const usage = new UsageRecorder();
  const running = await startJevServer({
    host: "127.0.0.1",
    port: 0,
    stack,
    usage,
    log: createSafeLogger(() => undefined),
  });
  try {
    await run(running.url, usage);
  } finally {
    await running.close();
  }
}

function post(url: string, payload: unknown): Promise<{ status: number; body: string }> {
  const data = JSON.stringify(payload);
  const parsed = new URL("/api/v1/analysis", url);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: "POST",
        headers: {
          host: `${parsed.hostname}:${parsed.port}`,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(data),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    req.on("error", reject);
    req.end(data);
  });
}

describe("analysis API usage and cost", () => {
  it("includes normalized usage when the provider supplies it", async () => {
    const usage: ProviderUsage = {
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      inputTokens: 100,
      outputTokens: 40,
      totalTokens: 140,
      source: "provider",
    };
    await withServer(stackWith(analystWith(usage), true), async (url, recorder) => {
      const response = await post(url, body);
      expect(response.status).toBe(200);
      const parsed = JSON.parse(response.body) as {
        usage: ProviderUsage;
        cost?: { amount: number; currency: string };
      };
      expect(parsed.usage.inputTokens).toBe(100);
      expect(parsed.usage.source).toBe("provider");
      expect(recorder.all()).toHaveLength(1);
      expect(recorder.all()[0]?.requestId.startsWith("req_")).toBe(true);
    });
  });

  it("includes cost when pricing is configured", async () => {
    const usage: ProviderUsage = {
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      inputTokens: 1_000,
      outputTokens: 1_000,
      source: "provider",
    };
    await withServer(stackWith(analystWith(usage), true), async (url) => {
      const response = await post(url, body);
      const parsed = JSON.parse(response.body) as {
        cost?: { amount: number; currency: string; pricingVersion: string; estimated: boolean };
      };
      expect(parsed.cost?.estimated).toBe(true);
      expect(parsed.cost?.currency).toBe("USD");
      expect(parsed.cost?.pricingVersion).toBe("v1");
      expect(parsed.cost?.amount).toBeCloseTo(0.018, 6);
    });
  });

  it("omits cost when pricing is unknown", async () => {
    const usage: ProviderUsage = {
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      inputTokens: 1_000,
      outputTokens: 1_000,
      source: "provider",
    };
    await withServer({ ...stackWith(analystWith(usage), false), pricing: [] }, async (url) => {
      const response = await post(url, body);
      const parsed = JSON.parse(response.body) as { cost?: unknown; usage: ProviderUsage };
      expect(parsed.cost).toBeUndefined();
      expect(parsed.usage.inputTokens).toBe(1_000);
    });
  });

  it("reports unavailable usage honestly and never fabricates zero", async () => {
    await withServer(stackWith(analystWith(undefined), false), async (url) => {
      const response = await post(url, body);
      const parsed = JSON.parse(response.body) as { usage: ProviderUsage };
      expect(parsed.usage.source).toBe("unavailable");
      expect(parsed.usage.inputTokens).toBeUndefined();
      expect(response.body).not.toContain('"inputTokens":0');
    });
  });

  it("does not break analysis when provider usage is malformed", async () => {
    const malformed = {
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      inputTokens: -5,
      source: "provider",
    } as unknown as ProviderUsage;
    await withServer(stackWith(analystWith(malformed), true), async (url) => {
      const response = await post(url, body);
      expect(response.status).toBe(200);
      const parsed = JSON.parse(response.body) as { usage: ProviderUsage };
      expect(parsed.usage.source).toBe("unavailable");
    });
  });

  it("does not record or expose secrets and source in the response", async () => {
    const usage: ProviderUsage = {
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      inputTokens: 10,
      source: "provider",
    };
    await withServer(stackWith(analystWith(usage), true), async (url, recorder) => {
      const response = await post(url, body);
      expect(response.body).not.toContain("sk-");
      expect(response.body).not.toContain("Bearer");
      const serialized = JSON.stringify(recorder.all());
      expect(serialized).not.toContain("sk-");
      expect(serialized).not.toContain('"task"');
      expect(serialized).not.toContain("export function login");
    });
  });
});
