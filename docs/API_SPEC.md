# Jev MVP v0.1 — API Specification

Base path:

```text
/api/v1
```

## POST /analysis

Request:

```json
{
  "task": "Review the authentication change",
  "workspace": {
    "name": "demo-project",
    "language": "typescript",
    "structure": ["src/api", "src/application", "src/domain"]
  },
  "currentFile": {
    "path": "src/api/auth.ts",
    "content": "..."
  },
  "selection": {
    "content": "..."
  },
  "gitDiff": "...",
  "client": {
    "ide": "vscode",
    "version": "..."
  }
}
```

Response:

```json
{
  "requestId": "req_123",
  "modelRecommendation": {
    "provider": "anthropic",
    "model": "claude",
    "score": 0.91,
    "reasons": [
      "Multi-file reasoning",
      "Architecture analysis"
    ]
  },
  "summary": "Potential architecture issue detected.",
  "findings": [
    {
      "type": "architecture",
      "severity": "medium",
      "title": "Business logic in controller",
      "evidence": [
        "AuthController contains authentication rules"
      ],
      "recommendation": "Move business logic into the application service.",
      "confidence": 0.89,
      "affectedFiles": [
        "src/api/auth.ts"
      ]
    }
  ]
}
```

## POST /model-recommendation

Used when only model selection is needed.

## GET /health

Response:

```json
{
  "status": "ok"
}
```

## Error format

```json
{
  "error": {
    "code": "INVALID_CONTEXT",
    "message": "The supplied context is invalid."
  }
}
```

Never return stack traces to users.

## Contract rules

- Validate all requests.
- Validate all provider responses.
- Limit request size.
- Version APIs.
- Keep provider-specific response formats out of the extension.
