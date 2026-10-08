# Jev MVP v0.1 — Architecture Decisions

## ADR-001 — VS Code first

Decision:
Use VS Code as the first host.

Reason:
It provides an established extension model and keeps Jev independent from undocumented Cursor internals.

## ADR-002 — Cursor is an adapter, not the foundation

Decision:
Do not make the company dependent on Cursor's private APIs.

Reason:
Jev must be portable across development environments.

## ADR-003 — Claude first

Decision:
Anthropic is the first AI provider.

Reason:
Claude is a strong fit for reasoning-heavy project analysis and is directly relevant to the Claude Startups application.

## ADR-004 — Provider-neutral router

Decision:
Use a model-provider interface.

Reason:
Jev's value is orchestration and engineering intelligence, not ownership of one model.

## ADR-005 — Recommendation before automatic switching

Decision:
MVP recommends models; it does not automatically switch models.

Reason:
Host capabilities and user credentials vary.

## ADR-006 — No autonomous code execution

Decision:
MVP does not execute commands or modify files autonomously.

Reason:
Safety, trust, and scope.

## ADR-007 — Local-first context collection

Decision:
Collect context locally and minimize what is sent externally.

Reason:
Source code is sensitive and context minimization improves cost and privacy.
