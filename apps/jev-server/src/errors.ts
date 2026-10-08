export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export class ProviderUnavailableError extends Error {
  readonly code = "PROVIDER_UNAVAILABLE";
  readonly status = 503;

  constructor(message: string) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}

export class ProviderRequestError extends Error {
  readonly code = "PROVIDER_UNAVAILABLE";
  readonly status = 503;

  constructor(
    readonly providerStatus: number | undefined,
    message?: string,
  ) {
    super(message ?? messageForProviderStatus(providerStatus));
    this.name = "ProviderRequestError";
  }
}

export class InvalidProviderResponseError extends Error {
  readonly code = "PROVIDER_RESPONSE_INVALID";
  readonly status = 502;

  constructor(message = "The analysis provider returned an invalid response.") {
    super(message);
    this.name = "InvalidProviderResponseError";
  }
}

export class ProviderTimeoutError extends Error {
  readonly code = "PROVIDER_UNAVAILABLE";
  readonly status = 503;

  constructor(message = "The analysis provider timed out. Try again.") {
    super(message);
    this.name = "ProviderTimeoutError";
  }
}

export class InvalidRecommendationError extends Error {
  readonly code = "PROVIDER_RESPONSE_INVALID";
  readonly status = 500;

  constructor(message = "The model recommendation could not be validated.") {
    super(message);
    this.name = "InvalidRecommendationError";
  }
}

export class ContextLimitError extends Error {
  readonly code = "PAYLOAD_TOO_LARGE";
  readonly status = 413;

  constructor(message = "The supplied context is too large.") {
    super(message);
    this.name = "ContextLimitError";
  }
}

function messageForProviderStatus(status: number | undefined): string {
  if (status === 401 || status === 403) {
    return "The analysis provider rejected the server credentials. Check ANTHROPIC_API_KEY.";
  }
  if (status === 404) {
    return "The configured model was not found. Check ANTHROPIC_MODEL.";
  }
  if (status === 429) {
    return "The analysis provider is rate limiting requests. Wait and try again.";
  }
  return "The analysis provider could not complete the request.";
}

export function readStatus(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = error.status;
    if (typeof status === "number" && Number.isInteger(status)) {
      return status;
    }
  }
  return undefined;
}

export function isSafeProviderError(
  error: unknown,
): error is
  | ProviderUnavailableError
  | ProviderRequestError
  | InvalidProviderResponseError
  | ProviderTimeoutError
  | ContextLimitError
  | InvalidRecommendationError {
  return (
    error instanceof ProviderUnavailableError ||
    error instanceof ProviderRequestError ||
    error instanceof InvalidProviderResponseError ||
    error instanceof ProviderTimeoutError ||
    error instanceof ContextLimitError ||
    error instanceof InvalidRecommendationError
  );
}
