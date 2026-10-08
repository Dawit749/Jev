const SECRET_SHAPED =
  /sk-ant-[A-Za-z0-9_-]{4,}|Bearer\s+\S+|-----BEGIN [A-Z0-9 ]*(?:PRIVATE KEY|CERTIFICATE)-----/i;

const FORBIDDEN_KEYS = new Set([
  "content",
  "source",
  "prompt",
  "apikey",
  "authorization",
  "task",
  "selection",
  "gitdiff",
  "cookie",
  "password",
  "secret",
  "evidence",
  "file",
  "body",
  "diff",
]);

export type SafeFields = Record<string, string | number | boolean>;
export type SafeLogger = (event: string, fields?: SafeFields) => void;

export function createSafeLogger(
  write: (line: string) => void = (line) => console.log(line),
): SafeLogger {
  return (event, fields = {}) => {
    const safe: SafeFields = {};
    for (const [key, value] of Object.entries(fields)) {
      const normalized = key.toLowerCase().replaceAll("_", "");
      if (FORBIDDEN_KEYS.has(normalized)) {
        continue;
      }
      if (typeof value === "string") {
        if (value.length > 200 || SECRET_SHAPED.test(value)) {
          continue;
        }
        safe[key] = value;
      } else if (typeof value === "number" || typeof value === "boolean") {
        if (typeof value === "number" && !Number.isFinite(value)) {
          continue;
        }
        safe[key] = value;
      }
    }
    write(JSON.stringify({ event, ...safe }));
  };
}
