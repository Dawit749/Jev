import { request as httpRequest } from "node:http";
import { describe, expect, it } from "vitest";
import { analysisResponseSchema } from "@jev/contracts";
import { startJevServer } from "./app.js";
import { createSafeLogger } from "./log.js";
import type { ModelProvider } from "./providers/types.js";
import { CLAUDE_PROFILE } from "./scoring.js";
import { createStack, type AnalysisStack } from "./stack.js";

const config = {
  host: "127.0.0.1",
  port: 8787,
  provider: "fake" as const,
  anthropicApiKey: "",
  anthropicModel: "claude-sonnet-5-5",
};

const requestBody = {
  task: "Review the authentication change for architecture issues",
  workspace: {
    name: "sample-auth",
    language: "typescript",
    structure: ["src/api/authController.ts", "src/application/authService.ts"],
  },
  currentFile: {
    path: "src/api/authController.ts",
    content: "SENTINEL_SOURCE_SHOULD_NOT_LOG export function login() { return true; }",
  },
  client: { ide: "vscode", version: "0.1.0" },
};

async function withServer(
  stack: AnalysisStack,
  run: (url: string, lines: string[]) => Promise<void>,
) {
  const lines: string[] = [];
  const running = await startJevServer({
    host: "127.0.0.1",
    port: 0,
    stack,
    log: createSafeLogger((line) => lines.push(line)),
    rateLimit: 4,
  });
  try {
    await run(running.url, lines);
  } finally {
    await running.close();
  }
}

function post(
  url: string,
  path: string,
  body: unknown,
  host = "",
): Promise<{ status: number; body: string }> {
  const payload = JSON.stringify(body);
  const parsed = new URL(path, url);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: "POST",
        headers: {
          host: host || `${parsed.hostname}:${parsed.port}`,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
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
    req.end(payload);
  });
}

describe("Jev API", () => {
  it("reports health and analyzes through the local server", async () => {
    await withServer(createStack(config), async (url, lines) => {
      const health = await fetch(`${url}/api/v1/health`);
      expect(await health.json()).toEqual({ status: "ok" });
      const response = await post(url, "/api/v1/analysis", requestBody);
      expect(response.status).toBe(200);
      const parsed = analysisResponseSchema.parse(JSON.parse(response.body));
      expect(parsed.analysisProvider.label).toBe("Local stub");
      expect(parsed.findings[0]?.title).toBe("Business logic in controller");
      expect(parsed.context.includedFiles).toEqual(["src/api/authController.ts"]);
      expect(response.body).not.toContain("SENTINEL_SOURCE_SHOULD_NOT_LOG");
      expect(lines.join("\n")).not.toContain("SENTINEL_SOURCE_SHOULD_NOT_LOG");
      expect(response.body).not.toContain("stack");
    });
  });

  it("recommends a model without calling a provider", async () => {
    await withServer(createStack(config), async (url) => {
      const response = await post(url, "/api/v1/model-recommendation", {
        task: "Review the authentication change for architecture issues",
        contextChars: 40_000,
        client: { ide: "vscode", version: "0.1.0" },
      });
      expect(response.status).toBe(200);
      const body = JSON.parse(response.body) as { modelRecommendation: { label: string } };
      expect(body.modelRecommendation.label).toBe("Claude");
    });
  });

  it("rejects secret paths, bad payloads, remote hosts, and stacks", async () => {
    const analyst: ModelProvider = {
      id: "anthropic",
      capabilities: () => ({
        id: "anthropic",
        label: "Claude",
        model: "claude-sonnet-5-5",
        available: true,
        profile: CLAUDE_PROFILE,
      }),
      analyze: () => Promise.reject(new Error("SECRET_STACK private source leaked")),
    };
    await withServer({ ...createStack(config), analyst }, async (url) => {
      const secret = await post(url, "/api/v1/analysis", {
        ...requestBody,
        currentFile: { path: ".env", content: "TOKEN=secret" },
      });
      expect(secret.status).toBe(400);
      expect(secret.body).toContain("INVALID_CONTEXT");
      expect(secret.body).not.toContain("TOKEN=secret");

      const remote = await post(url, "/api/v1/analysis", requestBody, "example.com");
      expect(remote.status).toBe(400);

      const crashed = await post(url, "/api/v1/analysis", requestBody);
      expect(crashed.status).toBe(500);
      expect(crashed.body).toContain("The analysis could not be completed.");
      expect(crashed.body).not.toContain("SECRET_STACK");
      expect(crashed.body).not.toContain("private source");
    });
  });

  it("rejects an invented affected file from the provider", async () => {
    const analyst: ModelProvider = {
      id: "anthropic",
      capabilities: () => ({
        id: "anthropic",
        label: "Claude",
        model: "claude-sonnet-5-5",
        available: true,
        profile: CLAUDE_PROFILE,
      }),
      analyze: () =>
        Promise.resolve({
          summary: "Potential architecture issue detected.",
          recommendation: "Move the logic.",
          findings: [
            {
              category: "architecture" as const,
              severity: "medium" as const,
              title: "Invented file",
              description: "Authentication rules were attributed to a file outside the supplied context.",
              evidence: ["The controller contains authentication rules."],
              recommendation: "Move the authentication rules into the application service.",
              why: "The cited controller path was not part of the supplied context.",
              uncertainty: "This is limited to the supplied project context and is not a certainty.",
              confidence: 0.4,
              affectedFiles: ["src/does-not-exist.ts"],
            },
          ],
        }),
    };
    await withServer({ ...createStack(config), analyst }, async (url) => {
      const response = await post(url, "/api/v1/analysis", requestBody);
      expect(response.status).toBe(502);
      expect(response.body).toContain("PROVIDER_RESPONSE_INVALID");
      expect(response.body).not.toContain("src/does-not-exist.ts");
    });
  });

  it("limits repeated analysis requests", async () => {
    const lines: string[] = [];
    const running = await startJevServer({
      host: "127.0.0.1",
      port: 0,
      stack: createStack(config),
      log: createSafeLogger((line) => lines.push(line)),
      rateLimit: 1,
    });
    try {
      const first = await post(running.url, "/api/v1/analysis", requestBody);
      const second = await post(running.url, "/api/v1/analysis", requestBody);
      expect(first.status).toBe(200);
      expect(second.status).toBe(429);
      expect(second.body).toContain("RATE_LIMITED");
      expect(lines.join("\n")).not.toContain("SENTINEL_SOURCE_SHOULD_NOT_LOG");
    } finally {
      await running.close();
    }
  });
});
