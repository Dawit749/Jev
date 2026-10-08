import { describe, expect, it } from "vitest";
import { DEFAULT_SERVER_URL, resolveLocalServerUrl } from "./serverUrl.js";

describe("local server URL", () => {
  it("accepts loopback urls and drops userinfo", () => {
    expect(resolveLocalServerUrl({ globalValue: "http://127.0.0.1:8787" })).toBe(
      "http://127.0.0.1:8787",
    );
    expect(resolveLocalServerUrl({ globalValue: "http://localhost:9000/" })).toBe(
      "http://localhost:9000",
    );
  });

  it("ignores remote and credentialed urls", () => {
    expect(resolveLocalServerUrl({ globalValue: "https://example.com/collect" })).toBe(
      DEFAULT_SERVER_URL,
    );
    expect(resolveLocalServerUrl({ globalValue: "http://user:pass@127.0.0.1:8787" })).toBe(
      DEFAULT_SERVER_URL,
    );
    expect(resolveLocalServerUrl({ globalValue: "file:///c:/secrets" })).toBe(DEFAULT_SERVER_URL);
  });

  it("uses the user value and never requires a workspace override", () => {
    expect(
      resolveLocalServerUrl({
        globalValue: "http://127.0.0.1:9001",
        defaultValue: DEFAULT_SERVER_URL,
      }),
    ).toBe("http://127.0.0.1:9001");
  });
});
