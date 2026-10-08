# Jev MVP v0.1 — Architecture

## 1. Architecture decision

Use a layered architecture:

```text
VS Code Extension
    |
    +-- UI / Commands
    |
    +-- Context Collector
    |
    +-- Jev Client
            |
            v
       Jev API Server
            |
    +-------+--------+
    |                |
    v                v
Task/Context     Model Router
Processing            |
                      v
                Provider Adapter
                      |
                   Claude
```

## 2. Components

### A. VS Code Extension

Responsibilities:
- Register commands
- Read permitted workspace context
- Read current editor/selection
- Display Jev sidebar
- Display notifications
- Send analysis requests
- Render findings

Must NOT:
- contain provider API secrets
- contain Anthropic API keys
- directly call external AI providers in production architecture

### B. Context Collector

Responsibilities:
- Current file
- Selected text
- Workspace root
- Safe project tree
- Relevant files
- Optional Git diff

Security:
- Never automatically upload arbitrary entire repositories.
- Respect ignore rules.
- Exclude secrets and sensitive files.
- Apply size limits.

### C. Jev API Server

Responsibilities:
- Validate requests
- Authenticate future users
- Normalize context
- Invoke router
- Return structured response
- Apply server-side provider policy
- Log safe metadata only

### D. Model Router

Provider-neutral interface:

```ts
interface ModelRouter {
  recommend(input: ModelRecommendationInput): Promise<ModelRecommendation>;
  analyze(input: AnalysisInput): Promise<AnalysisResult>;
}
```

The router must not hard-code the UI to Anthropic.

### E. Provider adapters

Initial:
- AnthropicAdapter

Future:
- OpenAIAdapter
- GoogleAdapter
- OtherProviderAdapter

### F. Analysis schema

Use structured JSON internally:

```ts
type AnalysisResult = {
  summary: string;
  recommendation: string;
  findings: Finding[];
  modelRecommendation: ModelRecommendation;
};

type Finding = {
  type: "architecture" | "duplication" | "risk" | "breaking_change" | "security" | "maintainability";
  severity: "info" | "low" | "medium" | "high";
  title: string;
  evidence: string[];
  recommendation: string;
  confidence: number;
  affectedFiles: string[];
};
```

## 3. Data flow

```text
Task
 + Current file
 + Selection
 + Project structure
 + Relevant changes
       |
       v
Context Sanitizer
       |
       v
Jev Server
       |
       v
Task Classifier
       |
       +--> Model Scorer
       |
       +--> Analysis Prompt
                    |
                    v
              Claude Adapter
                    |
                    v
             Structured result
                    |
                    v
             Response validator
                    |
                    v
                 VS Code
```

## 4. Local vs server responsibilities

Local:
- Workspace discovery
- File reading
- Context filtering
- UI
- User consent

Server:
- Provider API access
- Model policy
- Structured AI orchestration
- Future authentication
- Future usage controls

## 5. Failure handling

If Claude is unavailable:
- show clear error
- preserve user task
- do not fabricate an analysis
- allow retry

If context is too large:
- reduce context
- tell the user that context was narrowed
- retry only when safe

If provider response is malformed:
- reject it
- do not render unvalidated content as trusted structured data
