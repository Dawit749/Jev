import { readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { analysisResponseSchema, recommendationResponseSchema } from "@jev/contracts";
import { prepareAnalysisRequest } from "./apps/jev-extension/src/context/prepare.ts";
import {
  considerNotification,
  emptyNotifyState,
  notificationChoice,
} from "./apps/jev-extension/src/notifications/policy.ts";

const sentinel = "SENTINEL_PHASE9_SOURCE";
const secret = "SECRET_ENV_VALUE_PHASE9";

function post(
  port: number,
  path: string,
  body: string | Buffer,
  headers: Record<string, string | number> = {},
): Promise<{ status: number; body: string }> {
  const payload = typeof body === "string" ? Buffer.from(body) : body;
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: {
          host: `127.0.0.1:${port}`,
          "content-type": "application/json",
          "content-length": payload.length,
          ...headers,
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

function get(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { hostname: "127.0.0.1", port, path, method: "GET", headers: { host: `127.0.0.1:${port}` } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

const sample = readFileSync("examples/sample-auth/src/api/authController.ts", "utf8");
const prepared = prepareAnalysisRequest({
  task: "Review the authentication change for architecture issues",
  workspaceName: "sample-auth",
  language: "typescript",
  structure: ["src/api/authController.ts", "node_modules/pkg/index.js", "../secrets.txt"],
  currentFile: {
    path: "src/api/authController.ts",
    content: `${sentinel}\n${sample}`,
    languageId: "typescript",
  },
  relevantFiles: [
    { path: ".env", content: secret },
    { path: "src/application/authService.ts", content: "export function save() { return true; }" },
  ],
  gitDiff: "diff --git a/.env b/.env\n+SECRET_ENV_VALUE_PHASE9",
  clientVersion: "0.1.0",
});

const preparedJson = JSON.stringify(prepared.request);
if (preparedJson.includes(secret) || preparedJson.includes("node_modules")) {
  throw new Error("context filter leaked a secret path or value");
}
if (!prepared.excludedSensitive) {
  throw new Error("expected sensitive context to be marked excluded");
}

const health = await get(8787, "/api/v1/health");
const analysis = await post(8787, "/api/v1/analysis", preparedJson);
const parsed = analysisResponseSchema.safeParse(JSON.parse(analysis.body));
const recommendation = await post(
  8787,
  "/api/v1/model-recommendation",
  JSON.stringify({
    task: "Review the authentication change for architecture issues",
    contextChars: 1200,
    client: { ide: "vscode", version: "0.1.0" },
  }),
);
const recommended = recommendationResponseSchema.safeParse(JSON.parse(recommendation.body));
const malformed = await post(8787, "/api/v1/analysis", "{}");
const oversized = await post(8787, "/api/v1/analysis", Buffer.alloc(1_000_001, 97));
const remote = await post(8787, "/api/v1/analysis", preparedJson, { host: "example.com" });

let rateStatus = 0;
let attempts = 0;
for (let index = 0; index < 40; index += 1) {
  attempts += 1;
  const response = await post(
    8787,
    "/api/v1/model-recommendation",
    JSON.stringify({
      task: "Review the authentication change",
      client: { ide: "vscode", version: "0.1.0" },
    }),
  );
  rateStatus = response.status;
  if (response.status === 429) {
    break;
  }
}

const unavailable = await post(
  8788,
  "/api/v1/analysis",
  JSON.stringify({
    task: "Review the authentication change for architecture issues",
    workspace: { name: "sample-auth", structure: ["src/api/authController.ts"] },
    currentFile: { path: "src/api/authController.ts", content: "export function login() {}" },
    client: { ide: "vscode", version: "0.1.0" },
  }),
);

const decision = considerNotification({
  trigger: "analysis_complete",
  now: 5_000_000,
  status: "ok",
  findings: parsed.success ? parsed.data.findings : [],
  contextFingerprint: "phase9",
  state: emptyNotifyState(),
});
const dismiss = notificationChoice("Dismiss");

const report = {
  health: health.status,
  healthBody: health.body,
  analysis: analysis.status,
  analysisValid: parsed.success,
  findingCount: parsed.success ? parsed.data.findings.length : 0,
  findingId: parsed.success ? parsed.data.findings[0]?.id : undefined,
  category: parsed.success ? parsed.data.findings[0]?.category : undefined,
  providerLabel: parsed.success ? parsed.data.analysisProvider.label : undefined,
  recommendationLabel: parsed.success ? parsed.data.modelRecommendation.label : undefined,
  recommendationAvailable: parsed.success ? parsed.data.modelRecommendation.available : undefined,
  alternativesUnavailable: parsed.success
    ? parsed.data.alternatives.every((item) => item.available === false)
    : false,
  responseContainsSentinel: analysis.body.includes(sentinel),
  responseContainsSecret: analysis.body.includes(secret),
  modelRecommendation: recommendation.status,
  modelRecommendationValid: recommended.success,
  modelRecommendationLabel: recommended.success
    ? recommended.data.modelRecommendation.label
    : undefined,
  malformed: malformed.status,
  malformedCode: safeCode(malformed.body),
  oversized: oversized.status,
  oversizedCode: safeCode(oversized.body),
  remoteHost: remote.status,
  rateLimitStatus: rateStatus,
  rateLimitAttempts: attempts,
  unavailable: unavailable.status,
  unavailableCode: safeCode(unavailable.body),
  unavailableBodyHasStack: unavailable.body.includes("stack"),
  notification: decision.reason,
  notificationModal: decision.notification?.modal,
  notificationAnalyze: decision.notification?.analyze,
  notificationEdits: decision.notification?.editsFiles,
  dismissEdits: dismiss.editsFiles,
  dismissShell: dismiss.runsShell,
  dismissInstalls: dismiss.installsPackages,
  dismissConfig: dismiss.changesConfig,
};

console.log(JSON.stringify(report, null, 2));

function safeCode(body: string): string | undefined {
  try {
    const parsedBody = JSON.parse(body) as { error?: { code?: string } };
    return parsedBody.error?.code;
  } catch {
    return undefined;
  }
}
