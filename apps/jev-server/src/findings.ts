import {
  LIMITS,
  providerFindingSchema,
  type AnalysisRequest,
  type Finding,
  type ProviderFinding,
} from "@jev/contracts";
import { InvalidProviderResponseError } from "./errors.js";

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "because",
  "could",
  "other",
  "potential",
  "should",
  "supplied",
  "their",
  "there",
  "these",
  "those",
  "which",
  "while",
  "would",
]);

const UNSUPPORTED_CLAIMS = [
  "production database",
  "production db",
  "all customers",
  "live traffic",
];

export function publishFindings(
  findings: readonly ProviderFinding[],
  request: AnalysisRequest,
): Finding[] {
  if (findings.length > LIMITS.maxFindings) {
    throw new InvalidProviderResponseError();
  }
  const paths = allowedPaths(request);
  const corpus = contextCorpus(request, paths);
  return findings.map((finding, index) => {
    const parsed = providerFindingSchema.safeParse(finding);
    if (!parsed.success) {
      throw new InvalidProviderResponseError();
    }
    for (const filePath of parsed.data.affectedFiles) {
      if (!paths.has(filePath)) {
        throw new InvalidProviderResponseError();
      }
    }
    if (parsed.data.evidence.some((item) => !evidenceIsGrounded(item, corpus, paths))) {
      throw new InvalidProviderResponseError();
    }
    const claim = [
      parsed.data.title,
      parsed.data.description,
      parsed.data.recommendation,
      parsed.data.why,
    ].join("\n");
    if (hasUnsupportedClaim(claim, corpus)) {
      throw new InvalidProviderResponseError();
    }
    return { ...parsed.data, id: `f${index + 1}` };
  });
}

export function allowedPaths(input: AnalysisRequest): Set<string> {
  const allowed = new Set<string>();
  for (const entry of input.workspace.structure) {
    allowed.add(entry.replace(/\/$/, ""));
  }
  if (input.currentFile) {
    allowed.add(input.currentFile.path);
  }
  for (const file of input.relevantFiles ?? []) {
    allowed.add(file.path);
  }
  return allowed;
}

function contextCorpus(input: AnalysisRequest, paths: ReadonlySet<string>): string {
  const parts = [input.task, ...paths];
  if (input.currentFile) {
    parts.push(input.currentFile.path, input.currentFile.content);
  }
  if (input.selection) {
    parts.push(input.selection.content);
  }
  for (const file of input.relevantFiles ?? []) {
    parts.push(file.path, file.content);
  }
  if (input.gitDiff) {
    parts.push(input.gitDiff);
  }
  return parts.join("\n").toLowerCase();
}

function evidenceIsGrounded(evidence: string, corpus: string, paths: ReadonlySet<string>): boolean {
  const text = evidence.toLowerCase();
  for (const filePath of paths) {
    if (text.includes(filePath.toLowerCase())) {
      return true;
    }
  }
  return significantTokens(text).some((token) => corpus.includes(token));
}

function significantTokens(value: string): string[] {
  return value
    .split(/[^a-z0-9_./-]+/)
    .filter((token) => token.length >= 5 && !STOP_WORDS.has(token));
}

function hasUnsupportedClaim(text: string, corpus: string): boolean {
  const claim = text.toLowerCase();
  return UNSUPPORTED_CLAIMS.some((phrase) => claim.includes(phrase) && !corpus.includes(phrase));
}
