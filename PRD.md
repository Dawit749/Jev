# Jev MVP v0.1 — Product Requirements Document

## 1. Product

**Name:** Jev

**Category:** AI engineering intelligence for software development environments.

## 2. One-sentence definition

Jev is an AI engineering intelligence layer that helps developers choose appropriate AI models, make better technical decisions, identify engineering risks, and receive contextual, explainable guidance while building software.

## 3. Problem

AI coding tools can generate code, but developers still need to decide:

- Which model is appropriate for a task?
- Is a stronger reasoning model justified?
- Is the proposed implementation consistent with the architecture?
- Is existing functionality being duplicated?
- Could a change break related parts of the system?
- Why should one implementation approach be preferred over another?

Jev addresses the decision and reasoning layer around AI-assisted development.

## 4. MVP hypothesis

> Developers make better technical decisions when an AI intelligence layer understands their task and relevant project context and provides timely, explainable recommendations.

## 5. Target user

Primary:
- Individual software developers
- Developers using AI-assisted coding workflows
- Developers working on medium-complexity repositories

Secondary later:
- Small engineering teams
- Technical leads
- Engineering organizations

## 6. MVP user journey

1. Developer opens a project in VS Code.
2. Developer opens Jev.
3. Developer describes a task.
4. Jev collects only relevant local context.
5. Jev analyzes the task.
6. Jev recommends a model.
7. Jev identifies potential technical/architecture issues.
8. Jev presents a concise finding.
9. Developer opens Review.
10. Jev explains evidence and why the recommendation was made.
11. Developer can accept, dismiss, or request more explanation.

## 7. MVP capabilities

### 7.1 Task input
Developer can enter a natural-language task.

### 7.2 Context collection
MVP context:
- Current file
- Selected code
- Workspace/project structure
- Relevant repository metadata
- Optional Git diff when safely available

The MVP must minimize context sent to external providers.

### 7.3 Model recommendation
Jev evaluates task characteristics and produces a ranked recommendation.

Example:
- Claude — 91%
- GPT — 84%
- Gemini — 79%

These are Jev fit scores, NOT provider benchmark claims.

### 7.4 Technical analysis
Jev can identify:
- Architecture inconsistency
- Duplication
- Potential breaking changes
- Suspicious coupling
- Relevant files
- Maintainability concerns

The MVP must present findings as recommendations, not guaranteed truths.

### 7.5 Contextual notification
Jev can surface a finding in a non-blocking notification.

Notification actions:
- Review
- Why
- Ignore/Dismiss

MVP must avoid notification spam.

### 7.6 Explainability
Every significant recommendation should expose:
- Finding
- Evidence
- Recommendation
- Reason
- Confidence

Confidence is an internal/product signal, not a mathematical probability of correctness.

## 8. Non-goals

Not MVP:
- Full IDE replacement
- Full autonomous coding agent
- Own foundation model
- Mobile application
- Enterprise administration
- Team collaboration
- Billing
- Marketplace
- Automatic Cursor model switching
- Hidden manipulation of IDE internals
- Large-scale agent orchestration
- 20+ model integrations
- Automatic code modification without explicit user action

## 9. MVP success criteria

A demo is successful when:
1. A real repository opens in VS Code.
2. Developer enters a real engineering task.
3. Jev collects relevant context.
4. Jev calls Claude successfully.
5. Jev returns structured analysis.
6. Jev recommends a model.
7. Jev produces at least one useful technical finding on a suitable test project.
8. Jev displays a notification.
9. Developer opens Review.
10. Developer can inspect Why/evidence.
11. No secrets are exposed in the UI, logs, or repository.

## 10. Product principles

- Developer remains in control.
- Explain recommendations.
- Minimize context.
- Prefer local processing where possible.
- Never invent evidence.
- Never claim unsupported IDE control.
- Fail safely.
- Keep the MVP small.
