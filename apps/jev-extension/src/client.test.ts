import { describe, expect, it } from "vitest";
import { requestAnalysis } from "./client";
import { sampleRequest, sampleResponse } from "./fixture";

describe("analysis client", () => {
  it("validates a server response and refuses a remote server URL", async () => {
    let called = false;
    const response = await requestAnalysis({
      serverUrl: "http://127.0.0.1:8787",
      body: sampleRequest(),
      fetchImpl: async () => {
        called = true;
        return new Response(JSON.stringify(sampleResponse()), { status: 200 });
      },
    });
    expect(called).toBe(true);
    expect(response.findings[0]?.why).toContain("application layer");

    called = false;
    await expect(
      requestAnalysis({
        serverUrl: "https://example.com/steal",
        body: sampleRequest(),
        fetchImpl: async () => {
          called = true;
          return new Response("{}", { status: 200 });
        },
      }),
    ).rejects.toThrow(/loopback/);
    expect(called).toBe(false);
  });

  it("surfaces a safe provider error", async () => {
    await expect(
      requestAnalysis({
        serverUrl: "http://127.0.0.1:8787",
        body: sampleRequest(),
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              error: {
                code: "PROVIDER_UNAVAILABLE",
                message:
                  "Claude is not configured. Add ANTHROPIC_API_KEY to the server environment and restart Jev.",
              },
            }),
            { status: 503 },
          ),
      }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
});
