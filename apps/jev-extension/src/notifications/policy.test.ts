import { describe, expect, it } from "vitest";
import { sampleResponse } from "../fixture";
import {
  NOTIFICATION_POLICY,
  coalesceSaves,
  considerNotification,
  contextDigest,
  dismissIdentity,
  emptyNotifyState,
  fileDigest,
  fingerprintAfterSave,
  notificationChoice,
  parseNotifyState,
  pruneNotifyState,
  type NotifyState,
} from "./policy";

const finding = sampleResponse().findings[0];
if (!finding) {
  throw new Error("fixture missing");
}

const now = 1_000_000_000;
const fingerprint = "ctx-a";

function decide(
  overrides: Partial<Parameters<typeof considerNotification>[0]> = {},
  state: NotifyState = emptyNotifyState(),
) {
  return considerNotification({
    trigger: "analysis_complete",
    now,
    status: "ok",
    findings: [finding],
    contextFingerprint: fingerprint,
    state,
    ...overrides,
  });
}

describe("notification policy", () => {
  it("creates a non-blocking notification from a normalized finding", () => {
    const decision = decide();
    expect(decision.reason).toBe("created");
    expect(decision.notification?.message).toBe("Medium. Potential architecture issue detected.");
    expect(decision.notification?.actions).toEqual(["Review", "Why", "Dismiss"]);
    expect(decision.notification?.modal).toBe(false);
    expect(decision.notification?.level).toBe("information");
    expect(decision.notification?.analyze).toBe(false);
    expect(decision.notification?.message).not.toContain(finding.evidence[0] ?? "");
    expect(decide({ trigger: "explicit" }).reason).toBe("created");
  });

  it("maps Review, Why, and Dismiss without autonomous actions", () => {
    for (const choice of ["Review", "Why", "Dismiss"] as const) {
      const result = notificationChoice(choice);
      expect(result.editsFiles).toBe(false);
      expect(result.runsShell).toBe(false);
      expect(result.installsPackages).toBe(false);
      expect(result.changesConfig).toBe(false);
    }
    expect(notificationChoice("Review").action).toBe("review");
    expect(notificationChoice("Why").action).toBe("why");
    expect(notificationChoice("Dismiss").action).toBe("dismiss");
    expect(notificationChoice("Apply fix").action).toBe("none");
  });

  it("suppresses a duplicate and allows the same finding after the context changes", () => {
    const first = decide();
    const duplicate = decide({ now: now + NOTIFICATION_POLICY.minIntervalMs }, first.state);
    expect(duplicate.reason).toBe("duplicate");
    expect(duplicate.notification).toBeNull();

    const changed = decide(
      {
        now: now + NOTIFICATION_POLICY.minIntervalMs,
        contextFingerprint: "ctx-b",
      },
      first.state,
    );
    expect(changed.reason).toBe("created");
    expect(changed.notification?.contextFingerprint).toBe("ctx-b");
  });

  it("rate limits by interval and by how many notifications fit in the window", () => {
    const first = decide();
    const tooSoon = decide({ now: now + 1_000, contextFingerprint: "ctx-b" }, first.state);
    expect(tooSoon.reason).toBe("rate_interval");

    let state = emptyNotifyState();
    for (let index = 0; index < NOTIFICATION_POLICY.maxInWindow; index += 1) {
      const decision = decide(
        {
          now: now + index * NOTIFICATION_POLICY.minIntervalMs,
          contextFingerprint: `ctx-${index}`,
          findings: [{ ...finding, title: `Finding ${index}` }],
        },
        state,
      );
      expect(decision.reason).toBe("created");
      state = decision.state;
    }
    const blocked = decide(
      {
        now: now + NOTIFICATION_POLICY.maxInWindow * NOTIFICATION_POLICY.minIntervalMs,
        contextFingerprint: "ctx-next",
        findings: [{ ...finding, title: "Finding next" }],
      },
      state,
    );
    expect(blocked.reason).toBe("rate_window");
    expect(NOTIFICATION_POLICY.maxInWindow).toBe(3);
    expect(NOTIFICATION_POLICY.minIntervalMs).toBe(60_000);
  });

  it("uses finding severity for emphasis and skips quiet severities", () => {
    const critical = decide({
      findings: [{ ...finding, severity: "critical", category: "security" }],
    });
    expect(critical.notification?.level).toBe("warning");
    expect(critical.notification?.message).toBe(
      "Critical. Potential security risk detected in the supplied context.",
    );
    const high = decide({ findings: [{ ...finding, severity: "high", category: "api" }] });
    expect(high.notification?.level).toBe("warning");
    expect(high.notification?.message).toContain("API compatibility");
    const quiet = decide({
      findings: [{ ...finding, severity: "info", category: "maintainability" }],
    });
    expect(quiet.reason).toBe("severity");
    expect(quiet.notification).toBeNull();
  });

  it("does not notify for empty findings, an unavailable provider, or a malformed finding", () => {
    expect(decide({ findings: [] }).reason).toBe("empty");
    expect(decide({ status: "unavailable" }).reason).toBe("unavailable");
    expect(decide({ status: "malformed" }).reason).toBe("malformed");
    expect(decide({ findings: [{ title: "not a finding" }] }).reason).toBe("malformed");
    expect(decide({ findings: [] }).state.recent).toEqual([]);
  });

  it("persists notification state and drops expired entries", () => {
    const created = decide();
    const restored = parseNotifyState(created.state, now);
    expect(restored.recent).toHaveLength(1);
    expect(restored.lastNotifiedAt).toBe(now);
    const expired = pruneNotifyState(created.state, now + NOTIFICATION_POLICY.windowMs + 1);
    expect(expired.recent).toEqual([]);
    const dismissed = dismissIdentity(created.notification?.identity ?? "", now, created.state);
    const forgotten = pruneNotifyState(dismissed, now + NOTIFICATION_POLICY.dismissalTtlMs + 1);
    expect(forgotten.dismissed).toEqual([]);
    const stillDismissed = decide({ now: now + NOTIFICATION_POLICY.minIntervalMs }, dismissed);
    expect(stillDismissed.reason).toBe("dismissed");
  });

  it("ignores keystrokes and collapses rapid saves", () => {
    let state = emptyNotifyState();
    for (let index = 0; index < 20; index += 1) {
      const decision = decide({ trigger: "keystroke", now: now + index }, state);
      expect(decision.reason).toBe("keystroke");
      expect(decision.notification).toBeNull();
      state = decision.state;
    }
    expect(state).toEqual(emptyNotifyState());
    expect(coalesceSaves([0, 100, 200], NOTIFICATION_POLICY.saveDebounceMs)).toEqual([200]);
    expect(coalesceSaves([0, 2_000], NOTIFICATION_POLICY.saveDebounceMs)).toEqual([0, 2_000]);
  });

  it("notifies on a relevant save or git digest change and ignores an unrelated save", () => {
    const save = decide({
      trigger: "file_save",
      savedPath: "D:/work/src/api/authController.ts",
    });
    expect(save.reason).toBe("created");
    const unrelated = decide({
      trigger: "file_save",
      savedPath: "src/unrelated.ts",
    });
    expect(unrelated.reason).toBe("unrelated_save");
    const git = decide({ trigger: "git_diff", contextFingerprint: "diff-2" });
    expect(git.reason).toBe("created");
    expect(git.notification?.analyze).toBe(false);
  });

  it("keeps source text out of the digest, fingerprint, and notification state", () => {
    const sentinel = "SENTINEL_SOURCE_SHOULD_NOT_NOTIFY";
    const digest = contextDigest({
      task: "Review authentication",
      currentFile: { path: "src/api/authController.ts", content: sentinel },
    });
    const saved = fingerprintAfterSave("ctx-a", undefined, fileDigest(sentinel));
    expect(digest).not.toContain(sentinel);
    expect(saved).not.toContain(sentinel);
    const decision = decide({ contextFingerprint: digest });
    expect(JSON.stringify(decision.state)).not.toContain(sentinel);
    expect(decision.notification?.message).not.toContain(sentinel);
  });
});
