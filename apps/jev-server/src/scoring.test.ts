import { describe, expect, it } from "vitest";
import { SCORE_WEIGHTS, scoreModels } from "./scoring.js";
import { comparisonCatalog } from "./stack.js";

const catalog = comparisonCatalog(true);

describe("model fit scoring", () => {
  it("uses weights that sum to 1", () => {
    const total = Object.values(SCORE_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it("ranks the connected Claude profile first for an architecture task with a large context", () => {
    const result = scoreModels({
      task: "Review the authentication change for architecture issues",
      contextChars: 40_000,
      models: catalog,
    });
    expect(result.taskClassification.kind).toBe("large_context");
    expect(result.primary.label).toBe("Claude");
    expect(result.primary.available).toBe(true);
    expect(result.primary.reasons).toContain("High reasoning need");
    expect(result.primary.reasons).toContain("Large project context");
    expect(result.primary.fitStatement).toContain("Fit score:");
    expect(result.alternatives.map((item) => item.label)).toEqual(["GPT", "Gemini"]);
    expect(result.alternatives.every((item) => item.available === false)).toBe(true);
    expect(result.alternatives.every((item) => item.reasons.includes("Not connected"))).toBe(true);
  });

  it("keeps a disconnected faster profile out of the recommendation", () => {
    const result = scoreModels({
      task: "quickly fix the typo in the comment",
      contextChars: 0,
      models: catalog,
    });
    expect(result.taskClassification.kind).toBe("speed");
    expect(result.primary.label).toBe("Claude");
    expect(result.primary.available).toBe(true);
    const gemini = result.alternatives.find((item) => item.label === "Gemini");
    expect(gemini?.available).toBe(false);
    expect(gemini?.reasons).toContain("Not connected");
    expect(gemini?.score).toBeGreaterThan(result.primary.score);
  });

  it("applies a small preference boost without exceeding 1 or connecting a provider", () => {
    const plain = scoreModels({
      task: "fix the typo in the comment",
      contextChars: 0,
      models: catalog,
    });
    const preferred = scoreModels({
      task: "fix the typo in the comment",
      contextChars: 0,
      preferredProvider: "google",
      models: catalog,
    });
    const plainGemini = [plain.primary, ...plain.alternatives].find(
      (item) => item.provider === "google",
    );
    const preferredGemini = [preferred.primary, ...preferred.alternatives].find(
      (item) => item.provider === "google",
    );
    expect(plainGemini).toBeDefined();
    expect(preferredGemini).toBeDefined();
    expect(preferredGemini!.score).toBeGreaterThan(plainGemini!.score);
    expect(preferredGemini!.score).toBeLessThanOrEqual(1);
    expect(preferredGemini!.available).toBe(false);
    expect(preferred.primary.provider).toBe("anthropic");
  });
});
