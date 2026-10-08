# Jev MVP v0.1 — Testing Strategy

## Unit tests

Test:
- context filtering
- file exclusion
- context size limits
- model scoring
- request validation
- response validation
- notification throttling
- error mapping

## Integration tests

Test:
- extension → server
- server → Anthropic adapter
- malformed provider response
- provider unavailable
- oversized context

Use mocked providers for deterministic tests.

## Security tests

Verify:
- API key never enters extension bundle
- `.env` is excluded
- private keys excluded
- raw source not logged
- prompt injection does not override system instructions
- request size limits work

## Extension tests

Verify:
- Jev command opens
- sidebar renders
- task can be submitted
- loading state appears
- result appears
- Review works
- Why works
- errors are understandable

## Demo acceptance test

Given a small sample project:
1. Open project.
2. Start Jev.
3. Enter task.
4. Analyze.
5. Receive Claude result.
6. See model recommendation.
7. See finding.
8. Open Review.
9. Read Why.
10. Dismiss finding.
11. Repeat successfully.

## Definition of done

No critical TypeScript errors.
No secret leakage.
Core happy path works.
Errors are handled.
README setup instructions work.
