import { describe, expect, it } from "vitest";
import { AnalysisFailure } from "./client";
import { samplePrepared, sampleResponse } from "./fixture";
import { AnalysisSession } from "./session";

describe("analysis session", () => {
  it("moves from loading to a reviewable result and preserves the task on failure", async () => {
    let seen = "";
    const session = new AnalysisSession({
      collect: () => {
        const view = session.getView();
        seen = view.screen === "loading" ? `loading:${view.step}` : view.screen;
        return Promise.resolve(samplePrepared());
      },
      analyze: async () => sampleResponse(),
    });
    await session.submit("Review the authentication change");
    expect(seen).toBe("loading:1");
    const result = session.getView();
    expect(result.screen).toBe("result");
    if (result.screen !== "result") {
      return;
    }
    expect(result.result.findings[0]?.title).toBe("Business logic in controller");
    expect(result.result.modelRecommendation.label).toBe("Claude");
    session.openReview(0);
    const review = session.getView();
    expect(review.screen).toBe("review");
    if (review.screen === "review") {
      expect(review.highlightWhy).toBe(false);
      expect(review.accepted).toBe(false);
    }
    session.acceptFinding(0);
    const accepted = session.getView();
    expect(accepted.screen).toBe("review");
    if (accepted.screen === "review") {
      expect(accepted.accepted).toBe(true);
    }
    session.openWhy(0);
    const why = session.getView();
    expect(why.screen).toBe("review");
    if (why.screen === "review") {
      expect(why.highlightWhy).toBe(true);
      expect(why.result.findings[0]?.why).toContain("application layer");
    }
    session.back();
    expect(session.getView().screen).toBe("result");
    const signature = session.dismissFinding(0);
    expect(signature).toContain("Business logic in controller");
    const dismissed = session.getView();
    expect(dismissed.screen).toBe("result");
    if (dismissed.screen === "result") {
      expect(dismissed.result.findings).toHaveLength(0);
    }

    const failing = new AnalysisSession({
      collect: async () => samplePrepared(),
      analyze: async () => {
        throw new Error(
          "Could not reach the Jev server at http://127.0.0.1:8787. Start it with npm run dev:server.",
        );
      },
    });
    await failing.submit("Keep this task");
    const errorView = failing.getView();
    expect(errorView.screen).toBe("compose");
    if (errorView.screen === "compose") {
      expect(errorView.task).toBe("Keep this task");
      expect(errorView.error).toContain("Could not reach the Jev server");
    }
    await failing.submit("   ");
    const empty = failing.getView();
    expect(empty.screen).toBe("compose");
    if (empty.screen === "compose") {
      expect(empty.error).toContain("Describe a task");
    }

    const unavailable = new AnalysisSession({
      collect: async () => samplePrepared(),
      analyze: async () => {
        throw new AnalysisFailure("Claude is not configured.", "unavailable");
      },
    });
    await unavailable.submit("Keep the architecture review");
    const unavailableView = unavailable.getView();
    expect(unavailableView.screen).toBe("compose");
    if (unavailableView.screen === "compose") {
      expect(unavailableView.errorKind).toBe("unavailable");
      expect(unavailableView.task).toBe("Keep the architecture review");
    }

    const malformed = new AnalysisSession({
      collect: async () => samplePrepared(),
      analyze: async () => {
        throw new AnalysisFailure("Jev received an unexpected response.", "malformed");
      },
    });
    await malformed.submit("Keep the architecture review");
    const malformedView = malformed.getView();
    expect(malformedView.screen).toBe("compose");
    if (malformedView.screen === "compose") {
      expect(malformedView.errorKind).toBe("malformed");
    }
  });

  it("keeps an explicit empty findings result", async () => {
    const session = new AnalysisSession({
      collect: async () => samplePrepared(),
      analyze: async () => ({ ...sampleResponse(), findings: [] }),
    });
    await session.submit("Review the authentication change");
    const view = session.getView();
    expect(view.screen).toBe("result");
    if (view.screen === "result") {
      expect(view.result.findings).toEqual([]);
    }
  });
});
