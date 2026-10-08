# Jev MVP v0.1 — Implementation Plan

## Phase 0 — Repository foundation

- Create monorepo folders.
- Configure TypeScript.
- Configure linting/formatting.
- Add environment templates.
- Add `.gitignore`.
- Add docs.
- Verify clean install.

## Phase 1 — Extension shell

Build:
- VS Code extension activation
- Jev command
- Jev sidebar
- Basic task input
- Loading/error/result states

Exit condition:
Jev UI opens reliably.

## Phase 2 — Context collector

Implement:
- current file
- selection
- workspace structure
- safe file filtering
- size limits

Exit condition:
Context object can be inspected in tests without secrets.

## Phase 3 — Server/API

Implement:
- `/health`
- `/api/v1/analysis`
- request validation
- response schemas
- error handling

Exit condition:
Extension can call local server.

## Phase 4 — Claude adapter

Implement:
- Anthropic SDK
- environment configuration
- structured prompt
- response parsing
- validation

Exit condition:
Real Claude analysis works with a developer-provided key.

## Phase 5 — Model router

Implement:
- provider interface
- recommendation scoring
- Anthropic provider
- future provider placeholders/interfaces

Exit condition:
UI is independent of provider-specific code.

## Phase 6 — Findings and Review

Implement:
- finding cards
- severity
- evidence
- affected files
- Why
- confidence

Exit condition:
Developer can inspect a complete finding.

## Phase 7 — Notifications

Implement:
- non-blocking notification
- Review
- Why
- Dismiss
- throttling

Exit condition:
Notifications do not spam.

## Phase 8 — Security hardening

- secret exclusion
- logs
- request limits
- prompt injection defenses
- dependency audit
- error sanitization

## Phase 9 — Demo

Prepare:
- clean sample repository
- reproducible task
- recorded expected behavior
- README
- screenshots if useful

## Phase 10 — Future, not MVP

- Cursor adapter
- automatic model routing where supported
- Git diff intelligence
- background analysis
- additional providers
- autonomous execution

## Phase 11 — Verification

Phase 11 was a verification-only activity: real VS Code Extension Host GUI verification. It is not an implementation phase and produced no product-code changes or implementation commit.

## Phase 12 — Model Usage & Cost Intelligence

Status: complete. Implemented, automated verification passed, pricing configured, and real Extension Host GUI verification passed (manually confirmed).

- Provider-neutral usage normalization (Anthropic, OpenRouter).
- Estimated cost from server-side, versioned, configuration-driven pricing.
- In-memory server-side usage recording. No database.
- Compact usage section in the existing result UI.

Full plan: docs/PHASE_12_PLAN.md
