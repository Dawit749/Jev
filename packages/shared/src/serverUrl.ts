const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
export const DEFAULT_SERVER_URL = "http://127.0.0.1:8787";

export function resolveLocalServerUrl(input: {
  globalValue?: string;
  defaultValue?: string;
}): string {
  const candidate = input.globalValue?.trim() || input.defaultValue?.trim() || DEFAULT_SERVER_URL;
  return sanitizeServerUrl(candidate) ?? DEFAULT_SERVER_URL;
}

export function sanitizeServerUrl(candidate: string): string | undefined {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return undefined;
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    return undefined;
  }
  if (url.username || url.password) {
    return undefined;
  }
  url.search = "";
  url.hash = "";
  const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
  return `${url.protocol}//${url.host}${path}`;
}
