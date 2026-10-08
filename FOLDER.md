# Jev MVP v0.1 — Folder Structure

Recommended repository:

```text
jev/
├── apps/
│   ├── jev-extension/
│   │   ├── src/
│   │   │   ├── extension.ts
│   │   │   ├── commands/
│   │   │   ├── context/
│   │   │   ├── ui/
│   │   │   ├── client/
│   │   │   └── types/
│   │   ├── media/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── jev-server/
│       ├── src/
│       │   ├── api/
│       │   ├── application/
│       │   ├── domain/
│       │   ├── infrastructure/
│       │   │   ├── providers/
│       │   │   └── config/
│       │   ├── router/
│       │   ├── security/
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   ├── contracts/
│   └── shared/
│
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── FOLDER.md
│   ├── SECURITY.md
│   ├── UI_UX.md
│   ├── API_SPEC.md
│   ├── MODEL_ROUTER.md
│   ├── CLAUDE_INTEGRATION.md
│   ├── TESTING.md
│   ├── IMPLEMENTATION_PLAN.md
│   ├── DECISIONS.md
│   └── AGENTS.md
│
├── .env.example
├── .gitignore
├── README.md
└── package.json
```

## Rules

- `apps/jev-extension` contains IDE-specific code.
- `apps/jev-server` contains backend orchestration.
- `packages/contracts` contains shared API types.
- Provider-specific logic belongs under provider adapters.
- Do not place secrets in source control.
- Do not put Anthropic code directly inside UI components.
- Keep UI independent from provider choice.
