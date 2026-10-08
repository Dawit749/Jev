import { describe, expect, it } from "vitest";
import { truncateText } from "./text.js";

describe("truncateText", () => {
  it("keeps short text and marks long text", () => {
    expect(truncateText("hello", 10)).toEqual({ text: "hello", truncated: false });
    const result = truncateText("abcdefghijklmnopqrstuvwxyz", 16);
    expect(result.truncated).toBe(true);
    expect(result.text.endsWith("[truncated]")).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(16);
  });
});
