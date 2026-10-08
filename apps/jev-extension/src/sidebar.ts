import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import { resolveLocalServerUrl } from "@jev/shared";
import { checkHealth, requestAnalysis } from "./client";
import { collectAnalysisRequest } from "./context/collector";
import {
  NOTIFICATION_POLICY,
  considerNotification,
  contextDigest,
  dismissIdentity,
  fileDigest,
  fingerprintAfterSave,
  notificationChoice,
  parseNotifyState,
  pathsRelated,
  type NotificationTrigger,
  type NotifyState,
} from "./notifications/policy";
import { AnalysisSession } from "./session";
import { renderSidebar } from "./ui/render";

export class JevSidebarProvider implements vscode.WebviewViewProvider {
  private webviewView: vscode.WebviewView | undefined;
  private notifyState: NotifyState;
  private contextFingerprint = "";
  private readonly fileDigests = new Map<string, string>();
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly session: AnalysisSession;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.notifyState = parseNotifyState(context.workspaceState.get("jev.notify"), Date.now());
    this.session = new AnalysisSession({
      collect: (task) => collectAnalysisRequest(task),
      analyze: (request) => {
        this.contextFingerprint = contextDigest(request);
        this.fileDigests.clear();
        if (request.currentFile) {
          this.fileDigests.set(request.currentFile.path, fileDigest(request.currentFile.content));
        }
        for (const file of request.relevantFiles ?? []) {
          this.fileDigests.set(file.path, fileDigest(file.content));
        }
        return requestAnalysis({ serverUrl: currentServerUrl(), body: request });
      },
    });
    this.session.subscribe(() => this.render());
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.webviewView = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.onDidReceiveMessage((message: unknown) => {
      void this.onMessage(message);
    });
    this.render();
    void this.refreshHealth();
  }

  async reveal(): Promise<void> {
    await vscode.commands.executeCommand("jev.sidebar.focus");
  }

  async reviewFromCommand(): Promise<void> {
    await this.reveal();
    const candidate = this.session.currentCandidate();
    if (candidate) {
      this.session.openReview(candidate.index);
    }
  }

  async whyFromCommand(): Promise<void> {
    await this.reveal();
    const candidate = this.session.currentCandidate();
    if (candidate) {
      this.session.openWhy(candidate.index);
    }
  }

  dismissFromCommand(): void {
    const candidate = this.session.currentCandidate();
    if (!candidate) {
      return;
    }
    this.rememberDismissed(`${candidate.signature}|${this.contextFingerprint}`);
    this.session.dismissFinding(candidate.index);
  }

  onDocumentSaved(filePath: string, content: string): void {
    const previous = this.digestFor(filePath);
    if (previous === undefined) {
      return;
    }
    const digest = fileDigest(content);
    const fingerprint = fingerprintAfterSave(this.contextFingerprint, previous, digest);
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.contextFingerprint = fingerprint;
      this.rememberFileDigest(filePath, digest);
      void this.publishNotification("file_save", filePath);
    }, NOTIFICATION_POLICY.saveDebounceMs);
  }

  onGitDigest(digest: string): void {
    this.contextFingerprint = digest;
    void this.publishNotification("git_diff");
  }

  private async onMessage(message: unknown): Promise<void> {
    const parsed = parseMessage(message);
    if (!parsed) {
      return;
    }
    if (parsed.type === "analyze") {
      await this.session.submit(parsed.task);
      await this.publishNotification("analysis_complete");
      return;
    }
    if (parsed.type === "review") {
      this.session.openReview(parsed.index);
      return;
    }
    if (parsed.type === "why") {
      this.session.openWhy(parsed.index);
      return;
    }
    if (parsed.type === "accept") {
      this.session.acceptFinding(parsed.index);
      return;
    }
    if (parsed.type === "dismiss") {
      const signature = this.session.dismissFinding(parsed.index);
      if (signature) {
        this.rememberDismissed(`${signature}|${this.contextFingerprint}`);
      }
      return;
    }
    if (parsed.type === "back") {
      this.session.back();
      return;
    }
    this.session.editTask();
  }

  private async publishNotification(
    trigger: NotificationTrigger,
    savedPath?: string,
  ): Promise<void> {
    const view = this.session.getView();
    const findings =
      view.screen === "result" || view.screen === "review" ? view.result.findings : [];
    const status =
      view.screen === "compose" && view.errorKind === "unavailable"
        ? "unavailable"
        : view.screen === "compose" && view.errorKind === "malformed"
          ? "malformed"
          : "ok";
    const decision = considerNotification({
      trigger,
      now: Date.now(),
      status,
      findings,
      contextFingerprint: this.contextFingerprint,
      state: this.notifyState,
      ...(savedPath ? { savedPath } : {}),
    });
    this.notifyState = decision.state;
    await this.persist();
    const notification = decision.notification;
    if (!notification) {
      return;
    }
    const choice =
      notification.level === "warning"
        ? await vscode.window.showWarningMessage(notification.message, ...notification.actions)
        : await vscode.window.showInformationMessage(notification.message, ...notification.actions);
    const action = notificationChoice(choice);
    if (action.action === "review") {
      await this.reveal();
      this.session.openReview(notification.findingIndex);
      return;
    }
    if (action.action === "why") {
      await this.reveal();
      this.session.openWhy(notification.findingIndex);
      return;
    }
    if (action.action === "dismiss") {
      this.notifyState = dismissIdentity(notification.identity, Date.now(), this.notifyState);
      await this.persist();
      this.session.dismissFinding(notification.findingIndex);
    }
  }

  private async refreshHealth(): Promise<void> {
    const ok = await checkHealth(currentServerUrl());
    this.session.setServer(ok ? "ok" : "down");
  }

  private render(): void {
    if (!this.webviewView) {
      return;
    }
    const nonce = randomBytes(16).toString("base64");
    this.webviewView.webview.html = renderSidebar(
      this.session.getView(),
      nonce,
      this.webviewView.webview.cspSource,
    );
  }

  private rememberDismissed(identity: string): void {
    this.notifyState = dismissIdentity(identity, Date.now(), this.notifyState);
    void this.persist();
  }

  private digestFor(filePath: string): string | undefined {
    for (const [knownPath, digest] of this.fileDigests) {
      if (pathsRelated(filePath, knownPath)) {
        return digest;
      }
    }
    return undefined;
  }

  private rememberFileDigest(filePath: string, digest: string): void {
    for (const knownPath of this.fileDigests.keys()) {
      if (pathsRelated(filePath, knownPath)) {
        this.fileDigests.set(knownPath, digest);
        return;
      }
    }
  }

  private persist(): Thenable<void> {
    return this.context.workspaceState.update("jev.notify", this.notifyState);
  }
}

function currentServerUrl(): string {
  const inspected = vscode.workspace.getConfiguration("jev").inspect<string>("serverUrl");
  return resolveLocalServerUrl({
    ...(inspected?.globalValue ? { globalValue: inspected.globalValue } : {}),
    ...(inspected?.defaultValue ? { defaultValue: inspected.defaultValue } : {}),
  });
}

type WebviewMessage =
  | { type: "analyze"; task: string }
  | { type: "review" | "why" | "dismiss" | "accept"; index: number }
  | { type: "back" | "retry" };

function parseMessage(value: unknown): WebviewMessage | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (record.type === "analyze" && typeof record.task === "string") {
    return { type: "analyze", task: record.task };
  }
  if (
    (record.type === "review" ||
      record.type === "why" ||
      record.type === "dismiss" ||
      record.type === "accept") &&
    typeof record.index === "number" &&
    Number.isInteger(record.index)
  ) {
    return { type: record.type, index: record.index };
  }
  if (record.type === "back" || record.type === "retry") {
    return { type: record.type };
  }
  return undefined;
}
