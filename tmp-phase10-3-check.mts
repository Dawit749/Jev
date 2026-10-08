import { startJevServer } from "./apps/jev-server/src/app.ts";
import { createStack } from "./apps/jev-server/src/stack.ts";
import { loadRepoEnv, type ServerConfig } from "./apps/jev-server/src/config.ts";
import { createSafeLogger } from "./apps/jev-server/src/log.ts";
import { analysisRequestSchema, analysisResponseSchema } from "./packages/contracts/dist/index.js";

// Step 10.3 controlled smoke test.
// Modes: "real" (default), "missing-key", "invalid-key".
// Never prints OPENROUTER_API_KEY, authorization headers, prompts, or source bodies.

type Captured = {
  host: string;
  status: number;
  providerHeader: string | null;
  model: string | undefined;
};

const captured: Captured[] = [];
const externalHosts: string[] = [];
const originalFetch = globalThis.fetch;

globalThis.fetch = async (input, init): Promise<Response> => {
  const response = await originalFetch(input, init);
  try {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost" && url.hostname !== "::1") {
      externalHosts.push(url.hostname);
    }
    if (url.hostname === "openrouter.ai") {
      const payload = (await response.clone().json().catch(() => undefined)) as
        | { model?: unknown }
        | undefined;
      captured.push({
        host: url.host,
        status: response.status,
        providerHeader: response.headers.get("x-openrouter-provider"),
        model: typeof payload?.model === "string" ? payload.model : undefined,
      });
    }
  } catch {
    // Capture is best-effort and must never affect the request.
  }
  return response;
};

const mode = process.argv[2] ?? "real";
const smokePort = Number(process.env.JEV_SMOKE_PORT ?? "8787");
loadRepoEnv();

const configuredKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
const apiKey =
  mode === "missing-key" ? "" : mode === "invalid-key" ? "test-invalid-openrouter-key" : configuredKey;

const config: ServerConfig = {
  host: "127.0.0.1",
  port: smokePort,
  provider: "openrouter",
  anthropicApiKey: "",
  anthropicModel: "claude-sonnet-5-5",
  openrouterApiKey: apiKey,
  openrouterModel: process.env.OPENROUTER_MODEL?.trim() || "openrouter/free",
};

const logLines: string[] = [];
const log = createSafeLogger((line) => {
  logLines.push(line);
});

const running = await startJevServer({ host: config.host, port: config.port, stack: createStack(config), log });

const parsedRequest = analysisRequestSchema.safeParse({
  task: "Identify one architectural concern in this small example and explain it briefly.",
  workspace: { name: "example", language: "typescript", structure: ["example.ts"] },
  currentFile: {
    path: "example.ts",
    content:
      'export function getUser(id: string) {\n  return database.query("SELECT * FROM users WHERE id = " + id);\n}',
    languageId: "typescript",
  },
  contextNarrowed: false,
  client: { ide: "vscode", version: "0.1.0" },
});
if (!parsedRequest.success) {
  throw new Error("Built request failed schema validation.");
}

let jevStatus = 0;
let jevBody = "";
try {
  const response = await fetch(`http://127.0.0.1:${config.port}/api/v1/analysis`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(parsedRequest.data),
  });
  jevStatus = response.status;
  jevBody = await response.text();
} finally {
  await running.close();
}

let parsedFindings = 0;
let jevValid = false;
let firstCategory: string | undefined;
let providerLabel: string | undefined;
try {
  const parsed = analysisResponseSchema.safeParse(JSON.parse(jevBody));
  jevValid = parsed.success;
  if (parsed.success) {
    parsedFindings = parsed.data.findings.length;
    firstCategory = parsed.data.findings[0]?.category;
    providerLabel = parsed.data.analysisProvider.label;
  }
} catch {
  jevValid = false;
}

const secretToCheck = mode === "invalid-key" ? "test-invalid-openrouter-key" : configuredKey;
const report = {
  mode,
  modelRequested: config.openrouterModel,
  realRequestPerformed: captured.length > 0,
  openRouterCalls: captured.length,
  openRouterStatus: captured[0]?.status,
  openRouterProviderHeader: captured[0]?.providerHeader ?? undefined,
  openRouterModelReturned: captured[0]?.model,
  jevStatus,
  jevSchemaValid: jevValid,
  analysisProviderLabel: providerLabel,
  findingsProduced: parsedFindings,
  firstCategory,
  responseContainsKey: secretToCheck.length > 0 && jevBody.includes(secretToCheck),
  logsContainKeyOrBearer: logLines.some(
    (line) => (secretToCheck.length > 0 && line.includes(secretToCheck)) || /bearer\s+\S+/i.test(line),
  ),
  errorCode: safeCode(jevBody),
  errorMessage: safeMessage(jevBody),
  externalHosts: [...new Set(externalHosts)],
};

console.log(JSON.stringify(report, null, 2));

function safeCode(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: { code?: string } };
    return parsed.error?.code;
  } catch {
    return undefined;
  }
}

function safeMessage(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    const message = parsed.error?.message;
    return typeof message === "string" && message.length <= 300 ? message : undefined;
  } catch {
    return undefined;
  }
}
