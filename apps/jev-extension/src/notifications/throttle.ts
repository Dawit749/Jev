import type { Finding, FindingCategory, Severity } from "@jev/contracts";

export const NOTIFICATION_MIN_INTERVAL_MS = 60_000;
export const NOTIFICATION_SIGNATURE_WINDOW_MS = 10 * 60_000;

const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function findingSignature(
  finding: Pick<Finding, "category" | "severity" | "title" | "affectedFiles">,
): string {
  return [finding.category, finding.severity, finding.title, ...finding.affectedFiles]
    .join("|")
    .slice(0, 300);
}

export function isNoteworthy(finding: Pick<Finding, "category" | "severity">): boolean {
  return (
    finding.severity === "medium" ||
    finding.severity === "high" ||
    finding.severity === "critical" ||
    (finding.category === "architecture" && finding.severity !== "info")
  );
}

export function notificationCandidate(findings: readonly Finding[]):
  | {
      index: number;
      signature: string;
      severity: Severity;
      category: FindingCategory;
    }
  | undefined {
  let best:
    | {
        index: number;
        rank: number;
        signature: string;
        severity: Severity;
        category: FindingCategory;
      }
    | undefined;
  findings.forEach((finding, index) => {
    if (!isNoteworthy(finding)) {
      return;
    }
    const rank = SEVERITY_RANK[finding.severity];
    if (!best || rank > best.rank) {
      best = {
        index,
        rank,
        signature: findingSignature(finding),
        severity: finding.severity,
        category: finding.category,
      };
    }
  });
  if (!best) {
    return undefined;
  }
  return {
    index: best.index,
    signature: best.signature,
    severity: best.severity,
    category: best.category,
  };
}

export function shouldNotify(input: {
  now: number;
  signature: string;
  severity: Severity;
  category: FindingCategory;
  lastNotifiedAt: number | null;
  recentSignatures: readonly { signature: string; at: number }[];
  dismissed: readonly string[];
}): boolean {
  if (!isNoteworthy({ category: input.category, severity: input.severity })) {
    return false;
  }
  if (input.dismissed.includes(input.signature)) {
    return false;
  }
  if (
    input.lastNotifiedAt !== null &&
    input.now - input.lastNotifiedAt < NOTIFICATION_MIN_INTERVAL_MS
  ) {
    return false;
  }
  const recent = input.recentSignatures.find((item) => item.signature === input.signature);
  if (recent && input.now - recent.at < NOTIFICATION_SIGNATURE_WINDOW_MS) {
    return false;
  }
  return true;
}
