import { describe, expect, it } from "vitest";
import { findingSignature, notificationCandidate, shouldNotify } from "./throttle";
import { sampleResponse } from "../fixture";

const finding = sampleResponse().findings[0];
if (!finding) {
  throw new Error("fixture missing");
}

describe("notification throttling", () => {
  const base = {
    now: 1_000_000,
    signature: findingSignature(finding),
    severity: finding.severity,
    category: finding.category,
    lastNotifiedAt: null,
    recentSignatures: [],
    dismissed: [],
  };

  it("allows the first noteworthy finding and then suppresses spam", () => {
    expect(notificationCandidate(sampleResponse().findings)?.signature).toBe(base.signature);
    expect(shouldNotify(base)).toBe(true);
    expect(shouldNotify({ ...base, lastNotifiedAt: base.now - 10_000 })).toBe(false);
    expect(
      shouldNotify({
        ...base,
        lastNotifiedAt: base.now - 120_000,
        recentSignatures: [{ signature: base.signature, at: base.now - 120_000 }],
      }),
    ).toBe(false);
    expect(shouldNotify({ ...base, dismissed: [base.signature] })).toBe(false);
    expect(shouldNotify({ ...base, severity: "info", category: "maintainability" })).toBe(false);
  });
});
