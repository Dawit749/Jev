import type { AnalysisRequest, AnalysisResponse, Finding } from "@jev/contracts";
import { AnalysisFailure, type AnalysisErrorKind } from "./client";
import type { PrepareResult } from "./context/prepare";
import { LOADING_STEPS } from "./ui/copy";
import { findingSignature, notificationCandidate } from "./notifications/throttle";

export type ServerStatus = "unknown" | "ok" | "down";

export type SessionView =
  | {
      screen: "compose";
      task: string;
      server: ServerStatus;
      error?: string;
      errorKind?: AnalysisErrorKind;
    }
  | { screen: "loading"; task: string; step: number }
  | {
      screen: "result";
      task: string;
      result: AnalysisResponse;
      notice?: string;
      acceptedIds: readonly string[];
    }
  | {
      screen: "review";
      task: string;
      result: AnalysisResponse;
      index: number;
      highlightWhy: boolean;
      accepted: boolean;
    };

const GENERIC_ERROR = "The analysis could not be completed.";

export class AnalysisSession {
  private task = "";
  private server: ServerStatus = "unknown";
  private notice: string | undefined;
  private readonly accepted = new Set<string>();
  private view: SessionView = { screen: "compose", task: "", server: "unknown" };
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly deps: {
      collect: (task: string) => Promise<PrepareResult>;
      analyze: (request: AnalysisRequest) => Promise<AnalysisResponse>;
    },
  ) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getView(): SessionView {
    return this.view;
  }

  setServer(server: ServerStatus): void {
    this.server = server;
    if (this.view.screen === "compose") {
      this.view = { ...this.view, server };
      this.emit();
    }
  }

  async submit(task?: string): Promise<void> {
    if (this.view.screen === "loading") {
      return;
    }
    if (task !== undefined) {
      this.task = task;
    }
    const current = this.task.trim();
    if (!current) {
      this.view = {
        screen: "compose",
        task: this.task,
        server: this.server,
        error: "Describe a task before analyzing.",
      };
      this.emit();
      return;
    }
    this.view = { screen: "loading", task: current, step: 1 };
    this.emit();
    try {
      const prepared = await this.deps.collect(current);
      this.view = { screen: "loading", task: current, step: 2 };
      this.emit();
      const result = await this.deps.analyze(prepared.request);
      this.notice = contextNotice(prepared);
      this.task = current;
      this.accepted.clear();
      this.showResult(result);
    } catch (error) {
      this.view = {
        screen: "compose",
        task: current,
        server: this.server,
        error: safeMessage(error),
        errorKind: error instanceof AnalysisFailure ? error.kind : "generic",
      };
      this.emit();
    }
  }

  openReview(index: number): void {
    this.openFinding(index, false);
  }

  openWhy(index: number): void {
    this.openFinding(index, true);
  }

  back(): void {
    if (this.view.screen !== "review") {
      return;
    }
    this.showResult(this.view.result);
  }

  editTask(): void {
    if (this.view.screen === "loading") {
      return;
    }
    this.view = { screen: "compose", task: this.task, server: this.server };
    this.emit();
  }

  acceptFinding(index: number): void {
    if (this.view.screen !== "result" && this.view.screen !== "review") {
      return;
    }
    const finding = this.view.result.findings[index];
    if (!finding) {
      return;
    }
    this.accepted.add(finding.id);
    if (this.view.screen === "review") {
      const current = this.view.result.findings[this.view.index];
      this.view = { ...this.view, accepted: current ? this.accepted.has(current.id) : false };
      this.emit();
      return;
    }
    this.showResult(this.view.result);
  }

  dismissFinding(index: number): string | undefined {
    if (this.view.screen !== "result" && this.view.screen !== "review") {
      return undefined;
    }
    const finding = this.view.result.findings[index];
    if (!finding) {
      return undefined;
    }
    const signature = findingSignature(finding);
    const findings = this.view.result.findings.filter((_, itemIndex) => itemIndex !== index);
    this.showResult({ ...this.view.result, findings });
    return signature;
  }

  currentCandidate(): ReturnType<typeof notificationCandidate> {
    if (this.view.screen !== "result" && this.view.screen !== "review") {
      return undefined;
    }
    return notificationCandidate(this.view.result.findings);
  }

  private showResult(result: AnalysisResponse): void {
    this.view = {
      screen: "result",
      task: this.task,
      result,
      acceptedIds: [...this.accepted],
      ...(this.notice ? { notice: this.notice } : {}),
    };
    this.emit();
  }

  private openFinding(index: number, highlightWhy: boolean): void {
    if (this.view.screen !== "result" && this.view.screen !== "review") {
      return;
    }
    const finding = this.view.result.findings[index];
    if (!finding) {
      return;
    }
    this.view = {
      screen: "review",
      task: this.view.task,
      result: this.view.result,
      index,
      highlightWhy,
      accepted: this.accepted.has(finding.id),
    };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function contextNotice(prepared: PrepareResult): string | undefined {
  const notes: string[] = [];
  if (prepared.excludedSensitive) {
    notes.push("Sensitive files were excluded.");
  }
  if (prepared.narrowed) {
    notes.push("Context was narrowed to stay within size limits.");
  }
  return notes.length > 0 ? notes.join(" ") : undefined;
}

function safeMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return GENERIC_ERROR;
  }
  const message = error.message.trim();
  if (!message || message.length > 300 || message.includes("\n") || message.includes("    at ")) {
    return GENERIC_ERROR;
  }
  return message;
}

export function findingAt(view: SessionView): Finding | undefined {
  if (view.screen !== "review") {
    return undefined;
  }
  return view.result.findings[view.index];
}

export { LOADING_STEPS };
