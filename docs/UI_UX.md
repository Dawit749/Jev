# Jev MVP v0.1 — UI/UX Specification

## Product character

Professional developer tooling. Calm, technical, trustworthy.

Avoid:
- excessive gradients
- cartoon AI imagery
- noisy animations
- fake confidence
- unnecessary dashboards

## Primary UI

Jev should appear as a VS Code sidebar/panel.

### State 1 — Empty

```text
JEV

What are you building?

[ Describe your task... ]

[ Analyze ]
```

### State 2 — Analyzing

```text
JEV

Understanding task...
Collecting relevant context...
Analyzing architecture...
```

Never expose internal chain-of-thought.

### State 3 — Result

Sections:
- Model recommendation
- Findings
- Evidence
- Recommendation
- Confidence
- Review

## Notification

Non-blocking:

```text
💡 Jev
Potential architecture issue detected.

[Review] [Why] [Dismiss]
```

Notifications should be rate-limited.

## Review

Show:
- Finding type
- Severity
- Affected files
- Evidence
- Recommendation
- Why

Do not expose hidden chain-of-thought. "Why" means concise user-facing rationale and evidence.

## Accessibility

- Keyboard accessible
- Screen-reader labels
- No color-only status indicators
- Sufficient contrast
- Focus states
- Clear error messages
- Reduced-motion friendly

## UX principles

1. Explain before overwhelming.
2. Keep recommendations actionable.
3. Let developers dismiss findings.
4. Never block coding unnecessarily.
5. Show confidence as a product signal, not certainty.
6. Keep context controls visible and understandable.
