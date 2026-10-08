import type { FindingCategory, ModelScore, Severity } from "@jev/contracts";
import { findingAt, LOADING_STEPS, type SessionView } from "../session";
import { JEV_VERSION } from "../version";

const CATEGORY_LABELS: Record<FindingCategory, string> = {
  architecture: "Architecture",
  security: "Security",
  maintainability: "Maintainability",
  dependency: "Dependency",
  api: "API",
  compatibility: "Compatibility",
  performance: "Performance",
  code_quality: "Code quality",
};

const SEVERITY_LABELS: Record<Severity, string> = {
  info: "Info",
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export function renderSidebar(view: SessionView, nonce: string, cspSource: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${escapeHtml(cspSource)} 'unsafe-inline'; script-src 'nonce-${escapeHtml(nonce)}';" />
<title>Jev</title>
<style>${CSS}</style>
</head>
<body>
<main aria-live="polite">
${renderBody(view)}
</main>
<p class="meta footer">Jev ${escapeHtml(JEV_VERSION)}</p>
<script nonce="${escapeHtml(nonce)}">${CLIENT_SCRIPT}</script>
</body>
</html>`;
}

function renderBody(view: SessionView): string {
  if (view.screen === "loading") {
    return `<h1>JEV</h1>
<ol class="steps">
${LOADING_STEPS.map((step, index) => {
  const state = index < view.step ? "Done" : index === view.step ? "Current" : "Waiting";
  const current = index === view.step ? ' aria-current="step"' : "";
  return `<li${current}><span class="meta">${state}.</span> ${escapeHtml(step)}</li>`;
}).join("")}
</ol>`;
  }
  if (view.screen === "review") {
    return renderReview(view);
  }
  if (view.screen === "result") {
    return renderResult(view);
  }
  return `<h1>JEV</h1>
<p class="prompt">What are you building?</p>
<label for="task" class="meta">Task</label>
<textarea id="task" placeholder="Describe your task...">${escapeHtml(view.task)}</textarea>
${view.error ? `<p class="error" role="alert">${view.errorKind ? `${escapeHtml(errorHeading(view.errorKind))} ` : ""}${escapeHtml(view.error)}</p>` : ""}
<button id="analyze" data-action="analyze" type="button">Analyze</button>
<p class="meta server">${serverLabel(view.server)}</p>`;
}

function renderResult(view: Extract<SessionView, { screen: "result" }>): string {
  const scores = [view.result.modelRecommendation, ...view.result.alternatives];
  const findings = view.result.findings
    .map(
      (finding, index) => `<article class="card">
<p><span class="severity">${escapeHtml(SEVERITY_LABELS[finding.severity])}</span> · ${escapeHtml(CATEGORY_LABELS[finding.category])}</p>
<h3>${escapeHtml(finding.title)}</h3>
<p>${escapeHtml(finding.description)}</p>
<p>${escapeHtml(finding.recommendation)}</p>
<p class="meta" title="This is Jev's product signal, not a probability of correctness.">Confidence signal ${formatPercent(finding.confidence)}</p>
${view.acceptedIds.includes(finding.id) ? '<p class="meta">Accepted. No files were changed.</p>' : ""}
<div class="actions">
<button type="button" data-action="review" data-index="${index}">Review</button>
<button type="button" class="secondary" data-action="why" data-index="${index}">Why</button>
<button type="button" class="secondary" data-action="dismiss" data-index="${index}">Dismiss</button>
</div>
</article>`,
    )
    .join("");
  return `<h1>JEV</h1>
<p>${escapeHtml(view.result.summary)}</p>
<section>
<h2>Model recommendation</h2>
<p class="meta">${escapeHtml(view.result.taskClassification.label)}</p>
<p class="meta">${escapeHtml(view.result.fitDisclaimer)}</p>
<ol class="scores">
${scores.map((score) => renderScore(score)).join("")}
</ol>
<p>Analysis ran on ${escapeHtml(view.result.analysisProvider.label)} (${escapeHtml(view.result.analysisProvider.model)}).</p>
</section>
<section>
<h2>Findings</h2>
${findings || "<p>No findings were produced from the supplied context.</p>"}
</section>
<section>
<h2>Recommendation</h2>
<p>${escapeHtml(view.result.recommendation)}</p>
</section>
${renderContext(view.result.context.includedFiles, view.notice)}
<p class="actions"><button type="button" class="secondary" data-action="retry">Edit task</button></p>`;
}

function renderReview(view: Extract<SessionView, { screen: "review" }>): string {
  const finding = findingAt(view);
  if (!finding) {
    return `<h1>JEV</h1><p>That finding is no longer available.</p><button type="button" data-action="back">Back</button>`;
  }
  const accepted = view.accepted ? "<p>Accepted. No files were changed.</p>" : "";
  return `<h1>JEV</h1>
<p class="meta">Review</p>
<button type="button" class="secondary" data-action="back">Back</button>
<article class="card">
<p><span class="severity">${escapeHtml(SEVERITY_LABELS[finding.severity])}</span> · ${escapeHtml(CATEGORY_LABELS[finding.category])}</p>
<h2>${escapeHtml(finding.title)}</h2>
<p class="meta" title="This is Jev's product signal, not a probability of correctness.">Confidence signal ${formatPercent(finding.confidence)}. Confidence is a product signal, not a certainty.</p>
<h3>What Jev detected</h3>
<p>${escapeHtml(finding.description)}</p>
<h3>Affected files</h3>
${finding.affectedFiles.length ? `<ul>${finding.affectedFiles.map((file) => `<li>${escapeHtml(file)}</li>`).join("")}</ul>` : '<p class="meta">No specific file was cited.</p>'}
<h3>Evidence used</h3>
<ul>${finding.evidence.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
<h3 id="why">Why the evidence matters</h3>
<p${view.highlightWhy ? ' class="highlight"' : ""}>${escapeHtml(finding.why)}</p>
<h3>Recommendation</h3>
<p>${escapeHtml(finding.recommendation)}</p>
<h3>Uncertainty</h3>
<p>${escapeHtml(finding.uncertainty)}</p>
${accepted}
<div class="actions">
<button type="button" data-action="accept" data-index="${view.index}"${view.accepted ? " disabled" : ""}>Accept</button>
<button type="button" class="secondary" data-action="dismiss" data-index="${view.index}">Dismiss</button>
</div>
</article>`;
}

function errorHeading(kind: "unavailable" | "malformed" | "generic" | undefined): string {
  if (kind === "unavailable") {
    return "Provider unavailable.";
  }
  if (kind === "malformed") {
    return "Response rejected.";
  }
  return "Analysis failed.";
}

function renderScore(score: ModelScore): string {
  return `<li>
<span>${escapeHtml(score.label)}</span>
<span>Fit score: ${formatPercent(score.score)} · ${score.available ? "Connected" : "Not connected"}</span>
<span class="meta">${escapeHtml(score.fitStatement)}</span>
<span class="meta">${escapeHtml(score.reasons.join(" · "))}</span>
</li>`;
}

function renderContext(files: readonly string[], notice: string | undefined): string {
  const list = files.length
    ? `<ul>${files.map((file) => `<li>${escapeHtml(file)}</li>`).join("")}</ul>`
    : '<p class="meta">No file content was included.</p>';
  return `<section>
<h2>Context sent</h2>
${list}
${notice ? `<p class="meta">${escapeHtml(notice)}</p>` : ""}
</section>`;
}

function serverLabel(server: "unknown" | "ok" | "down"): string {
  if (server === "ok") {
    return "Local server connected";
  }
  if (server === "down") {
    return "Local server is not running";
  }
  return "Checking local server";
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const CSS = `
:root { color-scheme: light dark; }
body { margin: 0; padding: 16px; color: var(--vscode-foreground, CanvasText); background: var(--vscode-sideBar-background, Canvas); font-family: var(--vscode-font-family, sans-serif); font-size: 13px; line-height: 1.45; }
h1 { margin: 0 0 12px; font-size: 13px; letter-spacing: 0.08em; }
h2 { margin: 16px 0 8px; font-size: 13px; }
h3 { margin: 12px 0 6px; font-size: 13px; }
p { margin: 8px 0; }
button, textarea { font: inherit; }
textarea { width: 100%; min-height: 96px; box-sizing: border-box; margin: 8px 0; padding: 8px; color: var(--vscode-input-foreground, CanvasText); background: var(--vscode-input-background, Field); border: 1px solid var(--vscode-input-border, ButtonBorder); }
button { margin: 4px 6px 4px 0; padding: 6px 12px; color: var(--vscode-button-foreground, #ffffff); background: var(--vscode-button-background, #0e639c); border: none; cursor: pointer; }
button.secondary { color: var(--vscode-button-secondaryForeground, CanvasText); background: var(--vscode-button-secondaryBackground, ButtonFace); }
button:focus-visible, textarea:focus-visible { outline: 1px solid var(--vscode-focusBorder, Highlight); outline-offset: 2px; }
button:disabled { cursor: default; }
.card, .scores { border: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, ButtonBorder)); padding: 8px 10px; margin: 8px 0; }
.scores { list-style: none; padding-left: 10px; }
.scores li { display: grid; gap: 2px; margin: 8px 0; }
.meta, .footer { color: var(--vscode-descriptionForeground, GrayText); }
.severity { font-weight: 650; }
.error { color: var(--vscode-errorForeground, #c42b1c); }
.highlight { outline: 1px solid var(--vscode-focusBorder, Highlight); padding: 8px; }
.prompt { margin-bottom: 4px; }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto; } }
`;

const CLIENT_SCRIPT = `
const vscode = acquireVsCodeApi();
document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const action = target.closest("[data-action]");
  if (!(action instanceof HTMLElement)) return;
  const type = action.dataset.action;
  if (!type) return;
  if (type === "analyze") {
    const field = document.getElementById("task");
    const task = field instanceof HTMLTextAreaElement ? field.value : "";
    vscode.postMessage({ type: "analyze", task });
    return;
  }
  const index = action.dataset.index;
  vscode.postMessage({ type, ...(index ? { index: Number(index) } : {}) });
});
const field = document.getElementById("task");
field?.addEventListener("keydown", (event) => {
  if (!(event instanceof KeyboardEvent) || !(field instanceof HTMLTextAreaElement)) return;
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    vscode.postMessage({ type: "analyze", task: field.value });
  }
});
`;
