import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  LIMITS,
  analysisRequestSchema,
  analysisResponseSchema,
  healthResponseSchema,
  recommendationRequestSchema,
  recommendationResponseSchema,
} from "@jev/contracts";
import { HttpError, isSafeProviderError } from "./errors.js";
import { assertSafeAnalysisRequest, includedFiles } from "./guard.js";
import type { SafeLogger } from "./log.js";
import { JevModelRouter } from "./router.js";
import type { AnalysisStack } from "./stack.js";
import { UsageRecorder } from "./usageRecord.js";

export type AppOptions = {
  stack: AnalysisStack;
  log?: SafeLogger;
  now?: () => number;
  rateLimit?: number;
  rateWindowMs?: number;
  maxBytes?: number;
  usage?: UsageRecorder;
};

type RunningServer = {
  url: string;
  close: () => Promise<void>;
};

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

export function createApp(options: AppOptions) {
  const log = options.log ?? (() => undefined);
  const now = options.now ?? Date.now;
  const rateLimit = options.rateLimit ?? 30;
  const rateWindowMs = options.rateWindowMs ?? 60_000;
  const maxBytes = options.maxBytes ?? LIMITS.maxRequestBytes;
  const hits: number[] = [];
  const router = new JevModelRouter(options.stack, options.usage);

  function allow(current: number): boolean {
    const windowStart = current - rateWindowMs;
    while (hits.length > 0) {
      const first = hits[0];
      if (first === undefined || first >= windowStart) {
        break;
      }
      hits.shift();
    }
    if (hits.length >= rateLimit) {
      return false;
    }
    hits.push(current);
    return true;
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const requestId = `req_${crypto.randomUUID()}`;
    const started = now();
    try {
      if (!hostIsLoopback(req.headers.host)) {
        throw new HttpError(
          400,
          "INVALID_REQUEST",
          "The Jev server only accepts loopback requests.",
        );
      }
      const pathname = pathnameOf(req.url);
      if (req.method === "GET" && pathname === "/api/v1/health") {
        sendJson(res, 200, healthResponseSchema.parse({ status: "ok" }), requestId);
        log("request.complete", {
          requestId,
          route: "health",
          status: 200,
          durationMs: now() - started,
        });
        return;
      }
      if (
        req.method !== "POST" ||
        (pathname !== "/api/v1/analysis" && pathname !== "/api/v1/model-recommendation")
      ) {
        throw new HttpError(404, "NOT_FOUND", "That Jev endpoint does not exist.");
      }
      if (!allow(now())) {
        throw new HttpError(
          429,
          "RATE_LIMITED",
          "Too many analysis requests. Wait a moment and try again.",
        );
      }
      const body = await readJsonBody(req, maxBytes);
      if (pathname === "/api/v1/model-recommendation") {
        const parsed = recommendationRequestSchema.safeParse(body);
        if (!parsed.success) {
          throw new HttpError(
            400,
            "INVALID_CONTEXT",
            formatSchemaError(parsed.error.issues[0]?.path),
          );
        }
        const recommendation = await router.recommend({
          task: parsed.data.task,
          contextChars: parsed.data.contextChars ?? parsed.data.task.length,
          ...(parsed.data.preferredProvider
            ? { preferredProvider: parsed.data.preferredProvider }
            : {}),
        });
        const response = recommendationResponseSchema.parse({
          requestId,
          modelRecommendation: recommendation.primary,
          alternatives: recommendation.alternatives,
          taskClassification: recommendation.taskClassification,
          factors: recommendation.factors,
          fitDisclaimer: recommendation.fitDisclaimer,
        });
        sendJson(res, 200, response, requestId);
        log("request.complete", {
          requestId,
          route: "model-recommendation",
          status: 200,
          durationMs: now() - started,
          taskChars: parsed.data.task.length,
        });
        return;
      }

      const parsed = analysisRequestSchema.safeParse(body);
      if (!parsed.success) {
        throw new HttpError(
          400,
          "INVALID_CONTEXT",
          formatSchemaError(parsed.error.issues[0]?.path),
        );
      }
      assertSafeAnalysisRequest(parsed.data);
      const analysis = await router.analyze(parsed.data, requestId);
      const response = analysisResponseSchema.parse({
        requestId,
        ...analysis,
        context: {
          includedFiles: includedFiles(parsed.data),
          narrowed: parsed.data.contextNarrowed === true,
        },
      });
      sendJson(res, 200, response, requestId);
      log("request.complete", {
        requestId,
        route: "analysis",
        status: 200,
        durationMs: now() - started,
        provider: response.analysisProvider.provider,
        findingCount: response.findings.length,
        taskChars: parsed.data.task.length,
        usageSource: response.usage?.source ?? "unavailable",
        ...(response.usage?.inputTokens !== undefined
          ? { inputTokens: response.usage.inputTokens }
          : {}),
        ...(response.usage?.outputTokens !== undefined
          ? { outputTokens: response.usage.outputTokens }
          : {}),
        ...(response.usage?.totalTokens !== undefined
          ? { totalTokens: response.usage.totalTokens }
          : {}),
        ...(response.cost?.amount !== undefined ? { costAmount: response.cost.amount } : {}),
      });
    } catch (error) {
      const mapped = mapError(error);
      if (!res.headersSent) {
        sendJson(
          res,
          mapped.status,
          { error: { code: mapped.code, message: mapped.message } },
          requestId,
        );
      }
      log("request.failed", {
        requestId,
        status: mapped.status,
        code: mapped.code,
        durationMs: now() - started,
        name: error instanceof Error ? error.name : "Error",
      });
    }
  }

  return { handle };
}

export async function startJevServer(
  options: AppOptions & { host: string; port: number },
): Promise<RunningServer> {
  const app = createApp(options);
  const server = createServer((req, res) => {
    void app.handle(req, res);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("JEV_PORT could not be bound.");
  }
  const hostname = options.host.includes(":") ? `[${options.host}]` : options.host;
  return {
    url: `http://${hostname}:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

function pathnameOf(rawUrl: string | undefined): string {
  const url = new URL(rawUrl ?? "/", "http://127.0.0.1");
  const pathname = url.pathname.replace(/\/+$/, "");
  return pathname.length > 0 ? pathname : "/";
}

function hostIsLoopback(hostHeader: string | undefined): boolean {
  if (!hostHeader) {
    return false;
  }
  const withoutPort = hostHeader.replace(/:\d+$/, "");
  const host = withoutPort.replace(/^\[/, "").replace(/\]$/, "");
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

async function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const contentType = req.headers["content-type"];
  if (!contentType || !contentType.toLowerCase().startsWith("application/json")) {
    throw new HttpError(400, "INVALID_REQUEST", "Content-Type must be application/json.");
  }
  const declared = Number(req.headers["content-length"] ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new HttpError(413, "PAYLOAD_TOO_LARGE", "The request is too large.");
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      throw new HttpError(413, "PAYLOAD_TOO_LARGE", "The request is too large.");
    }
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "INVALID_REQUEST", "The request body must be valid JSON.");
  }
}

function formatSchemaError(path: PropertyKey[] | undefined): string {
  const label = path && path.length > 0 ? path.map(String).join(".") : "request";
  return `The supplied context is invalid (${label}).`;
}

function mapError(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof HttpError || isSafeProviderError(error)) {
    return { status: error.status, code: error.code, message: error.message };
  }
  return { status: 500, code: "INTERNAL", message: "The analysis could not be completed." };
}

function sendJson(res: ServerResponse, status: number, body: unknown, requestId: string): void {
  res.writeHead(status, { ...JSON_HEADERS, "x-request-id": requestId });
  res.end(JSON.stringify(body));
}
