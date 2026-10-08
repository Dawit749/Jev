import { describe, expect, it } from "vitest";
import { sampleResponse } from "../fixture";
import { renderSidebar } from "./render";

function render(result: ReturnType<typeof sampleResponse>): string {
  return renderSidebar(
    {
      screen: "result",
      task: "Review authentication",
      result,
      acceptedIds: [],
    },
    "nonce",
    "https://csp.test",
  );
}

describe("usage section rendering", () => {
  it("shows the compact usage section with tokens and estimated cost", () => {
    const html = render(sampleResponse());
    expect(html).toContain("<h2>Usage</h2>");
    expect(html).toContain("Model: claude-sonnet-5-5");
    expect(html).toContain("Input: 12,450");
    expect(html).toContain("Output: 2,180");
    expect(html).toContain("Total: 14,630");
    expect(html).toContain("Estimated cost: $0.042");
    expect(html).toContain("Pricing: v1");
  });

  it("shows unavailable values honestly when usage is absent", () => {
    const response = sampleResponse();
    const html = render({
      ...response,
      usage: { provider: "anthropic", model: "claude-sonnet-5-5", source: "unavailable" },
      cost: undefined,
    });
    expect(html).toContain("Input: Unavailable");
    expect(html).toContain("Output: Unavailable");
    expect(html).toContain("Total: Unavailable");
    expect(html).toContain("Estimated cost: Unavailable");
    expect(html).not.toContain("Input: 0");
  });

  it("labels estimated cost and never implies authoritative billing", () => {
    const html = render(sampleResponse());
    expect(html).toContain("Estimated cost");
    expect(html.toLowerCase()).not.toContain("actual cost");
  });

  it("does not fabricate a cost when pricing is unknown", () => {
    const response = sampleResponse();
    const html = render({ ...response, cost: undefined });
    expect(html).toContain("Estimated cost: Unavailable");
    expect(html).not.toContain("$0.00");
  });
});
