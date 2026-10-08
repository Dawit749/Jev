import {
  findingSchema,
  type AnalysisRequest,
  type Finding,
  type FindingCategory,
  type Severity,
} from "@jev/contracts";
import { notificationCandidate } from "./throttle";

export const NOTIFICATION_POLICY = {
  minIntervalMs: 60_000,
  duplicateWindowMs: 10 * 60_000,
  maxInWindow: 3,
  windowMs: 10 * 60_000,
  dismissalTtlMs: 7 * 24 * 60 * 60_000,
  saveDebounceMs: 1_500,
} as const;

export const NOTIFICATION_ACTIONS = ["Review", "Why", "Dismiss"] as const;

const SEVERITY_LABEL: Record<Severity, string> = {
  info: "Info",
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const SIGNAL: Record<FindingCategory, string> = {
  architecture: "Potential architecture issue detected.",
  security: "Potential security risk detected in the supplied context.",
  api: "Potential API compatibility concern detected.",
  compatibility: "Potential compatibility concern detected.",
  dependency: "Potential dependency concern detected.",
  maintainability: "Potential maintainability issue detected.",
  performance: "Potential performance concern detected.",
  code_quality: "Potential code quality issue detected.",
};

export type NotificationTrigger =
  "analysis_complete" | "file_save" | "git_diff" | "explicit" | "keystroke";

export type NotificationStatus = "ok" | "unavailable" | "malformed";

export type NotifyState = {
  lastNotifiedAt: number | null;
  recent: { identity: string; signature: string; at: number }[];
  dismissed: { identity: string; at: number }[];
};

export type JevNotification = {
  identity: string;
  signature: string;
  contextFingerprint: string;
  message: string;
  severity: Severity;
  category: FindingCategory;
  findingIndex: number;
  level: "information" | "warning";
  modal: false;
  actions: typeof NOTIFICATION_ACTIONS;
  analyze: false;
  editsFiles: false;
  runsShell: false;
  installsPackages: false;
  changesConfig: false;
};

export type NotificationDecision = {
  notification: JevNotification | null;
  state: NotifyState;
  reason: string;
};

export function emptyNotifyState(): NotifyState {
  return { lastNotifiedAt: null, recent: [], dismissed: [] };
}

export function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function contextDigest(
  request: Pick<
    AnalysisRequest,
    "task" | "currentFile" | "selection" | "gitDiff" | "relevantFiles"
  >,
): string {
  const parts = [
    request.task,
    request.currentFile?.path ?? "",
    request.currentFile?.content ?? "",
    request.selection?.content ?? "",
    request.gitDiff ?? "",
    ...(request.relevantFiles ?? []).flatMap((file) => [file.path, file.content]),
  ];
  return hashText(parts.join("\n"));
}

export function fileDigest(content: string): string {
  return hashText(content);
}

export function fingerprintAfterSave(
  current: string,
  previousFileDigest: string | undefined,
  nextFileDigest: string,
): string {
  if (previousFileDigest === nextFileDigest) {
    return current;
  }
  return hashText(`${current}|${nextFileDigest}`);
}

export function coalesceSaves(timestamps: readonly number[], debounceMs: number): number[] {
  const emitted: number[] = [];
  let last: number | null = null;
  for (const time of timestamps) {
    if (last !== null && time - last > debounceMs) {
      emitted.push(last);
    }
    last = time;
  }
  if (last !== null) {
    emitted.push(last);
  }
  return emitted;
}

export function considerNotification(input: {
  trigger: NotificationTrigger;
  now: number;
  status: NotificationStatus;
  findings: readonly unknown[];
  contextFingerprint: string;
  state: NotifyState;
  savedPath?: string;
}): NotificationDecision {
  const state = pruneNotifyState(input.state, input.now);
  if (input.trigger === "keystroke") {
    return { notification: null, state, reason: "keystroke" };
  }
  if (input.status === "unavailable") {
    return { notification: null, state, reason: "unavailable" };
  }
  if (input.status === "malformed") {
    return { notification: null, state, reason: "malformed" };
  }
  const findings = input.findings.flatMap((item) => {
    const parsed = findingSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
  if (input.findings.length > 0 && findings.length === 0) {
    return { notification: null, state, reason: "malformed" };
  }
  if (findings.length === 0) {
    return { notification: null, state, reason: "empty" };
  }
  const candidate = notificationCandidate(findings);
  if (!candidate) {
    return { notification: null, state, reason: "severity" };
  }
  const finding = findings[candidate.index];
  if (!finding) {
    return { notification: null, state, reason: "empty" };
  }
  if (
    input.trigger === "file_save" &&
    !finding.affectedFiles.some((file) => pathsRelated(input.savedPath ?? "", file))
  ) {
    return { notification: null, state, reason: "unrelated_save" };
  }
  const identity = `${candidate.signature}|${input.contextFingerprint}`;
  if (state.dismissed.some((item) => item.identity === identity)) {
    return { notification: null, state, reason: "dismissed" };
  }
  if (
    state.recent.some(
      (item) =>
        item.identity === identity && input.now - item.at < NOTIFICATION_POLICY.duplicateWindowMs,
    )
  ) {
    return { notification: null, state, reason: "duplicate" };
  }
  const inWindow = state.recent.filter(
    (item) => input.now - item.at < NOTIFICATION_POLICY.windowMs,
  );
  if (
    state.lastNotifiedAt !== null &&
    input.now - state.lastNotifiedAt < NOTIFICATION_POLICY.minIntervalMs
  ) {
    return { notification: null, state, reason: "rate_interval" };
  }
  if (inWindow.length >= NOTIFICATION_POLICY.maxInWindow) {
    return { notification: null, state, reason: "rate_window" };
  }
  const notification = toNotification(
    finding,
    candidate.index,
    candidate.signature,
    identity,
    input.contextFingerprint,
  );
  return {
    notification,
    reason: "created",
    state: {
      lastNotifiedAt: input.now,
      recent: [...inWindow, { identity, signature: candidate.signature, at: input.now }],
      dismissed: state.dismissed,
    },
  };
}

export function notificationChoice(choice: string | undefined): {
  action: "review" | "why" | "dismiss" | "none";
  editsFiles: false;
  runsShell: false;
  installsPackages: false;
  changesConfig: false;
} {
  const action =
    choice === "Review"
      ? "review"
      : choice === "Why"
        ? "why"
        : choice === "Dismiss"
          ? "dismiss"
          : "none";
  return {
    action,
    editsFiles: false,
    runsShell: false,
    installsPackages: false,
    changesConfig: false,
  };
}

export function dismissIdentity(identity: string, now: number, state: NotifyState): NotifyState {
  const pruned = pruneNotifyState(state, now);
  if (pruned.dismissed.some((item) => item.identity === identity)) {
    return pruned;
  }
  return {
    ...pruned,
    dismissed: [...pruned.dismissed, { identity, at: now }].slice(-100),
  };
}

export function parseNotifyState(value: unknown, now: number): NotifyState {
  if (!value || typeof value !== "object") {
    return emptyNotifyState();
  }
  const record = value as {
    lastNotifiedAt?: unknown;
    recent?: unknown;
    dismissed?: unknown;
  };
  const recent = Array.isArray(record.recent)
    ? record.recent.flatMap((item) => {
        if (!item || typeof item !== "object") {
          return [];
        }
        const entry = item as { identity?: unknown; signature?: unknown; at?: unknown };
        if (typeof entry.at !== "number") {
          return [];
        }
        if (typeof entry.identity === "string") {
          return [
            {
              identity: entry.identity,
              signature: typeof entry.signature === "string" ? entry.signature : entry.identity,
              at: entry.at,
            },
          ];
        }
        if (typeof entry.signature === "string") {
          return [{ identity: entry.signature, signature: entry.signature, at: entry.at }];
        }
        return [];
      })
    : [];
  const dismissed = Array.isArray(record.dismissed)
    ? record.dismissed.flatMap((item) => {
        if (typeof item === "string") {
          return [{ identity: item, at: now }];
        }
        if (!item || typeof item !== "object") {
          return [];
        }
        const entry = item as { identity?: unknown; at?: unknown };
        if (typeof entry.identity === "string" && typeof entry.at === "number") {
          return [{ identity: entry.identity, at: entry.at }];
        }
        return [];
      })
    : [];
  return pruneNotifyState(
    {
      lastNotifiedAt: typeof record.lastNotifiedAt === "number" ? record.lastNotifiedAt : null,
      recent,
      dismissed,
    },
    now,
  );
}

export function pruneNotifyState(state: NotifyState, now: number): NotifyState {
  return {
    lastNotifiedAt: state.lastNotifiedAt,
    recent: state.recent.filter((item) => now - item.at < NOTIFICATION_POLICY.windowMs),
    dismissed: state.dismissed.filter((item) => now - item.at < NOTIFICATION_POLICY.dismissalTtlMs),
  };
}

function toNotification(
  finding: Finding,
  findingIndex: number,
  signature: string,
  identity: string,
  contextFingerprint: string,
): JevNotification {
  const strong = finding.severity === "high" || finding.severity === "critical";
  return {
    identity,
    signature,
    contextFingerprint,
    message: `${SEVERITY_LABEL[finding.severity]}. ${SIGNAL[finding.category]}`,
    severity: finding.severity,
    category: finding.category,
    findingIndex,
    level: strong ? "warning" : "information",
    modal: false,
    actions: NOTIFICATION_ACTIONS,
    analyze: false,
    editsFiles: false,
    runsShell: false,
    installsPackages: false,
    changesConfig: false,
  };
}

export function pathsRelated(saved: string, affected: string): boolean {
  const left = saved.replaceAll("\\", "/").toLowerCase();
  const right = affected.replaceAll("\\", "/").replace(/^\.\//, "").toLowerCase();
  return left === right || left.endsWith(`/${right}`);
}
