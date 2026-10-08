import {
  analysisResponseSchema,
  errorResponseSchema,
  type AnalysisRequest,
  type AnalysisResponse,
} from "@jev/contracts";
import { sanitizeServerUrl } from "@jev/shared";

export type AnalysisErrorKind = "unavailable" | "malformed" | "generic";

export class AnalysisFailure extends Error {
  constructor(
    message: string,
    readonly kind: AnalysisErrorKind,
  ) {
    super(message);
    this.name = "AnalysisFailure";
  }
}

export async function checkHealth(
  serverUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const base = sanitizeServerUrl(serverUrl);
  if (!base) {
    return false;
  }
  try {
    const response = await fetchImpl(`${base}/api/v1/health`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) {
      return false;
    }
    const payload: unknown = await response.json();
    return (
      typeof payload === "object" &&
      payload !== null &&
      "status" in payload &&
      payload.status === "ok"
    );
  } catch {
    return false;
  }
}

export async function requestAnalysis(options: {
  serverUrl: string;
  body: AnalysisRequest;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<AnalysisResponse> {
  const base = sanitizeServerUrl(options.serverUrl);
  if (!base) {
    throw new AnalysisFailure("Jev server URL must be a loopback address.", "generic");
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${base}/api/v1/analysis`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(options.body),
      signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new AnalysisFailure("The analysis timed out. Try again.", "unavailable");
    }
    throw new AnalysisFailure(
      `Could not reach the Jev server at ${base}. Start it with npm run dev:server.`,
      "unavailable",
    );
  }
  const payload: unknown = await readJson(response);
  if (!response.ok) {
    const parsed = errorResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new AnalysisFailure("The analysis could not be completed.", "generic");
    }
    throw new AnalysisFailure(parsed.data.error.message, kindForCode(parsed.data.error.code));
  }
  const parsed = analysisResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AnalysisFailure("Jev received an unexpected response.", "malformed");
  }
  return parsed.data;
}

function kindForCode(code: string): AnalysisErrorKind {
  if (code === "PROVIDER_UNAVAILABLE") {
    return "unavailable";
  }
  if (code === "PROVIDER_RESPONSE_INVALID") {
    return "malformed";
  }
  return "generic";
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
