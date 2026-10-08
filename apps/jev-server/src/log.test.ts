import { describe, expect, it } from "vitest";
import { createSafeLogger } from "./log.js";

describe("safe logger", () => {
  it("drops source, prompts, and secrets", () => {
    const lines: string[] = [];
    const log = createSafeLogger((line) => lines.push(line));
    log("analysis.complete", {
      requestId: "req_1",
      taskChars: 12,
      content: "SENTINEL_SOURCE",
      prompt: "full prompt",
      apiKey: "sk-ant-secret",
      task: "Review the private repository",
    });
    expect(lines).toHaveLength(1);
    const line = lines[0] ?? "";
    expect(line).toContain("req_1");
    expect(line).toContain("taskChars");
    expect(line).not.toContain("SENTINEL_SOURCE");
    expect(line).not.toContain("sk-ant-secret");
    expect(line).not.toContain("private repository");
    expect(line).not.toContain("full prompt");
  });

  it("drops an allowed field when the value itself contains a key or token", () => {
    const lines: string[] = [];
    const log = createSafeLogger((line) => lines.push(line));
    log("request.failed", {
      requestId: "req_2",
      note: "prefix sk-ant-secret suffix",
      header: "Bearer super-secret-token",
    });
    const line = lines[0] ?? "";
    expect(line).toContain("req_2");
    expect(line).not.toContain("sk-ant-secret");
    expect(line).not.toContain("super-secret-token");
    expect(line).not.toContain("Bearer");
  });
});
