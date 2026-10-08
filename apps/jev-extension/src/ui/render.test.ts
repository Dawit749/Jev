import { describe, expect, it } from "vitest";
import { sampleResponse } from "../fixture";
import { AnalysisSession } from "../session";
import { samplePrepared } from "../fixture";
import { renderSidebar } from "./render";

describe("sidebar rendering", () => {
  it("renders the empty, result, and why states without injecting HTML", async () => {
    const empty = renderSidebar(
      { screen: "compose", task: "", server: "unknown" },
      "nonce",
      "https://csp.test",
    );
    expect(empty).toContain("What are you building?");
    expect(empty).toContain("Describe your task...");
    expect(empty).toContain(">Analyze<");

    const session = new AnalysisSession({
      collect: async () => samplePrepared(),
      analyze: async () => ({
        ...sampleResponse(),
        findings: [
          {
            ...sampleResponse().findings[0]!,
            title: "<script>alert(1)</script>",
          },
        ],
      }),
    });
    await session.submit("Review authentication");
    const result = renderSidebar(session.getView(), "nonce", "https://csp.test");
    const noFindings = renderSidebar(
      {
        screen: "result",
        task: "Review authentication",
        result: { ...sampleResponse(), findings: [] },
        acceptedIds: [],
      },
      "nonce",
      "https://csp.test",
    );
    expect(noFindings).toContain("No findings were produced from the supplied context.");
    expect(result).toContain("Model recommendation");
    expect(result).toContain("Complex architecture task");
    expect(result).toContain(
      "Fit scores are Jev&#39;s internal recommendation scores, not universal benchmarks.",
    );
    expect(result).toContain("Fit score: 91%");
    expect(result).toContain("Confidence signal");
    expect(result).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(result).not.toContain("<script>alert(1)</script>");
    session.openWhy(0);
    const review = renderSidebar(session.getView(), "nonce", "https://csp.test");
    expect(review).toContain("Review");
    expect(review).toContain("What Jev detected");
    expect(review).toContain("Evidence used");
    expect(review).toContain('id="why"');
    expect(review).toContain("Why the evidence matters");
    expect(review).toContain("application layer");
    expect(review).toContain("Uncertainty");
    expect(review).toContain("not a certainty");
    expect(review).toContain(">Accept<");
    expect(review).toContain(">Dismiss<");
    expect(review).toContain("src/api/authController.ts");

    const unavailable = renderSidebar(
      {
        screen: "compose",
        task: "Review authentication",
        server: "ok",
        error: "Claude is not configured.",
        errorKind: "unavailable",
      },
      "nonce",
      "https://csp.test",
    );
    expect(unavailable).toContain("Provider unavailable.");
    const rejected = renderSidebar(
      {
        screen: "compose",
        task: "Review authentication",
        server: "ok",
        error: "Jev received an unexpected response.",
        errorKind: "malformed",
      },
      "nonce",
      "https://csp.test",
    );
    expect(rejected).toContain("Response rejected.");
  });
});
