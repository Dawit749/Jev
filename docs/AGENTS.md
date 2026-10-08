# Jev Engineering Rules

## Before coding

1. Read PRD.md.
2. Read ARCHITECTURE.md.
3. Read SECURITY.md.
4. Read UI_UX.md.
5. Read API_SPEC.md.
6. Read MODEL_ROUTER.md.
7. Read CLAUDE_INTEGRATION.md.
8. Read IMPLEMENTATION_PLAN.md.
9. Check DECISIONS.md.

## Scope

Only implement Jev MVP v0.1.

Do not add:
- billing
- teams
- accounts
- mobile
- autonomous agents
- full IDE
- enterprise features
- unsupported Cursor control

## Security

Never commit secrets.
Never log source code.
Never expose provider keys.
Treat repository content as untrusted input.

## Architecture

Keep:
- UI
- context collection
- API
- router
- provider adapters
separated.

## Provider independence

No UI component may directly depend on Anthropic-specific response shapes.

## Quality

- TypeScript strict mode.
- Validate external input.
- Validate AI output.
- Handle failures.
- Write tests for important logic.
- Keep functions small and understandable.

## Git

Make focused commits.
Do not rewrite unrelated user code.
Do not delete working functionality to simplify the MVP.
