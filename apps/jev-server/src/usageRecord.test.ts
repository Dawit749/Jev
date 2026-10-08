import { describe, expect, it } from "vitest";
import { UsageRecorder } from "./usageRecord.js";

describe("in-memory usage recording", () => {
  it("records by requestId and reads back", () => {
    const recorder = new UsageRecorder();
    recorder.record({
      requestId: "req_1",
      usage: { provider: "anthropic", model: "claude", source: "provider", inputTokens: 1 },
    });
    expect(recorder.has("req_1")).toBe(true);
    expect(recorder.all()).toHaveLength(1);
  });

  it("de-duplicates the same requestId", () => {
    const recorder = new UsageRecorder();
    recorder.record({
      requestId: "req_1",
      usage: { provider: "anthropic", model: "claude", source: "provider", inputTokens: 1 },
    });
    recorder.record({
      requestId: "req_1",
      usage: { provider: "anthropic", model: "claude", source: "provider", inputTokens: 2 },
    });
    expect(recorder.all()).toHaveLength(1);
    expect(recorder.all()[0]?.usage.inputTokens).toBe(2);
  });

  it("stays bounded and drops the oldest records", () => {
    const recorder = new UsageRecorder(3);
    for (let index = 0; index < 5; index += 1) {
      recorder.record({
        requestId: `req_${index}`,
        usage: { provider: "anthropic", model: "claude", source: "provider", inputTokens: index },
      });
    }
    expect(recorder.all()).toHaveLength(3);
    expect(recorder.has("req_0")).toBe(false);
    expect(recorder.has("req_4")).toBe(true);
  });

  it("does not record task text, source, or raw provider data", () => {
    const recorder = new UsageRecorder();
    recorder.record({
      requestId: "req_1",
      usage: { provider: "anthropic", model: "claude", source: "provider", inputTokens: 1 },
    });
    const serialized = JSON.stringify(recorder.all());
    expect(serialized).not.toContain("task");
    expect(serialized).not.toContain("content");
    expect(serialized).not.toContain("sk-");
  });
});
