# Phase 12 — Model Usage & Cost Intelligence

## 1. Phase title

# Phase 12 — Model Usage & Cost Intelligence

## 2. Status

**Implemented and verified.** Documentation reflects completed work.

Provider usage normalization, Anthropic and OpenRouter usage capture, versioned pricing, estimated cost, in-memory usage recording, the optional usage/cost fields on `/api/v1/analysis`, and the compact result-UI usage section are implemented and covered by tests. Nothing became a database, persistent history, budget system, or analytics dashboard.

### Implementation status detail

- Implemented: normalized `ProviderUsage`; Anthropic and OpenRouter usage capture; honest unavailable handling; versioned configuration-driven pricing; estimated cost; in-memory recording by `requestId`; optional `usage`/`cost` on the analysis response; compact UI usage section.
- Tested: contracts, normalization, pricing, recording, API, provider capture, UI, security, and regression (baseline 99/99 preserved).
- Unavailable / deferred: persistent usage history; Today/Week/Month windows; budget management and enforcement; billing integration; provider billing APIs; any database; `GET /api/v1/usage/summary`.
- Known limitation: the repository ships an **empty** pricing table by default, so cost is `Unavailable` until pricing profiles are configured locally. No production prices are fabricated.

## 3. Goal

> Give developers transparent, provider-neutral visibility into AI model usage, token consumption, and estimated cost while keeping model selection, code execution, and file modification under explicit user control.

The core user question Jev answers in this phase:

> "What model am I using, how much am I using it, and approximately how much does it cost?"

## 4. Background and current state

- The implementation roadmap originally stopped at Phase 10.
- Phase 10 is complete: the OpenRouter provider, provider catalog/router integration, and security/logging hardening. Tests pass 99/99. Commit `2eb97ba`.
- Phase 11 was a verification activity (real VS Code Extension Host / GUI verification). It produced no product-code changes and no implementation commit.
- The server is currently **stateless**: there is no database, no persistence layer, and no cache. The only existing persistence is the extension's `workspaceState`, used for notification throttle/dismiss state.
- Provider adapters currently **discard** the token usage that providers return:
  - `apps/jev-server/src/providers/anthropic.ts` reads only `parsed_output`.
  - `apps/jev-server/src/providers/openrouter.ts` reads only the message content.
- Cost does not exist as a concept today. The word "cost" in the current code (`apps/jev-server/src/scoring.ts`) means *task cost-sensitivity scoring* — a recommendation factor, not money.
- The product already has a precedent for careful labeling: `FIT_DISCLAIMER` ("Fit scores are Jev's internal recommendation scores, not universal benchmarks"). Phase 12 reuses that discipline for cost by labeling it **Estimated cost**.

Phase 12 is a new, separately approved phase. It does not rewrite the history of Phases 0–10, and it does not retroactively reclassify Phase 11.

## 5. User problem

Developers using AI-assisted workflows cannot easily answer:

- Which provider/model is actually handling my request?
- How many tokens did this analysis consume?
- Approximately what did it cost?

Today Jev discards this information. Providers often return it, but it is neither normalized nor surfaced. Without it, developers cannot reason about cost, cannot compare models on real usage, and cannot build trust in the tool's footprint.

## 6. Scope

In scope for Phase 12 (MVP of the phase):

- Normalize provider-supplied token usage into a provider-neutral structure.
- Capture usage from the initial providers: Anthropic and OpenRouter.
- Compute an **estimated cost** from server-side, versioned, configuration-driven pricing.
- Record usage in memory server-side and surface it in the existing result UI.
- Represent unavailable usage/cost honestly.

Out of scope: see §10 (Non-goals) and §9 (Deferred features).

## 7. Must-have features

1. **Provider-neutral usage contract.** A normalized `ProviderUsage` structure (see §12) with all token fields optional.
2. **Anthropic usage capture.** Read the usage the Anthropic SDK exposes; map to `ProviderUsage`.
3. **OpenRouter usage capture.** Read the `usage` object from the OpenRouter response; map to `ProviderUsage`.
4. **Honest absence.** Missing usage is `unavailable`, never `0`.
5. **Estimated cost.** Computed as `input tokens × input price + output tokens × output price`, from a versioned pricing profile. Unknown pricing → `unavailable`.
6. **In-memory usage recording.** Server-side, correlated by the existing `requestId`. No database.
7. **Optional usage/cost on the analysis response.** Extend `/api/v1/analysis`; do not add a "record usage" endpoint.
8. **Compact usage section in the result UI** (see §16).
9. **Tests** across contracts, providers, cost, API, security, UI, and regression (see §20).

## 8. Should-have features

Documented as optional Phase 12 work. They must **not** silently become mandatory scope:

- Provider/model breakdown (aggregate by provider and model).
- Compact aggregate usage view.
- Lightweight usage summary.

## 9. Deferred features

**Deferred / Future consideration.** Not required in Phase 12:

- Persistent usage history.
- Today / Week / Month history windows.
- Budget management, budget limits, budget enforcement.
- Billing account integration and provider billing APIs.
- Subscription management and enterprise billing.
- Any database: SQLite, local JSON database, or otherwise.
- Long-term telemetry storage.

`GET /api/v1/usage/summary` is **deferred/optional**. It may be considered only if implementation evidence later shows it is necessary.

## 10. Non-goals

Phase 12 must not introduce or enable:

- automatic model switching
- Cursor model-selector control
- automatic provider selection
- autonomous coding
- autonomous execution
- automatic file editing
- background continuous AI analysis
- unrelated Git intelligence
- autonomous agents

Jev remains a recommendation/visibility system. The user remains in control.

## 11. Architecture

Phase 12 follows the existing layered architecture and preserves provider neutrality:

```text
VS Code Extension (presentation only)
        |
        v
Jev API Server  (/api/v1/analysis)
        |
        +--> Model Router            (unchanged interfaces)
        |
        +--> Provider Adapter        (Anthropic | OpenRouter)
        |         |
        |         +--> ProviderUsage (normalized)
        |
        +--> Pricing Profiles (server-side, versioned)
        |         |
        |         +--> CostEstimate
        |
        +--> In-memory usage recording (correlated by requestId)
        |
        v
Analysis response (optional usage + cost)
        |
        v
Extension result UI (compact usage section)
```

Design rules:

- Provider-specific raw usage fields never cross into the UI contract.
- The extension receives only normalized, non-sensitive values.
- No new database or persistence layer is introduced.
- Existing router and provider interfaces are preserved; usage is an **optional** addition.

## 12. Provider usage normalization

Conceptual normalized structure:

```text
ProviderUsage
- provider        (string)
- model           (string)
- inputTokens?    (integer >= 0)
- outputTokens?   (integer >= 0)
- totalTokens?    (integer >= 0)
- source          ("provider" | "estimated" | "unavailable")
```

Rules:

- All token fields are **optional** wherever a provider may omit information.
- Missing information means **unavailable**, never `0`.
- `source` distinguishes how the values were obtained.
- Provider-specific raw fields must never leak into the UI contract.
- The UI consumes only this normalized shape, mirroring how `analysisProvider` already normalizes provider identity.

## 13. Pricing model

Pricing is **server-side, versioned, and configuration-driven**. It must not depend on live provider billing APIs for the MVP.

A pricing profile supports:

```text
PricingProfile
- provider
- model
- inputTokenPrice
- outputTokenPrice
- currency
- effectiveDate
- pricingVersion
```

Cost formula:

```text
(input tokens × input price)
+
(output tokens × output price)
=
estimated cost
```

Conceptual cost structure:

```text
CostEstimate
- amount?        (number >= 0)
- currency       (string)
- pricingVersion (string)
- estimated      (true)
- note?
```

Rules:

- Cost is always explicitly labeled **Estimated cost** unless authoritative billing data is introduced in a future, separately approved phase.
- Unknown pricing → `amount = unavailable`. Never fabricate a cost.
- Do not assume USD unless the configured pricing profile specifies it; always carry `currency`.
- Exact unit conversion and rounding are implementation details to be defined later.

### Model aliases

```text
requested model
      |
      v
resolved model
      |
      v
pricing profile
```

Where provider infrastructure exposes a resolved model ID, that resolved ID should be preferred for pricing. Do not invent resolved IDs when the provider does not supply one.

## 14. Data model

Conceptual only. No schema is created by this document.

- **ProviderUsage** — `provider`, `model`, optional `inputTokens` / `outputTokens` / `totalTokens`, `source`.
- **PricingProfile** — `provider`, `model`, `inputTokenPrice`, `outputTokenPrice`, `currency`, `effectiveDate`, `pricingVersion`.
- **CostEstimate** — optional `amount`, `currency`, `pricingVersion`, `estimated`, optional `note`.
- **UsageRecord** — `requestId`, `at` (timestamp), `status`, `ProviderUsage`, optional `CostEstimate`. Must not contain task text, source, prompts, file contents, or raw provider errors.

Relationships:

- One `UsageRecord` references one `ProviderUsage`.
- One `ProviderUsage` may yield one optional `CostEstimate`, derived from a matching `PricingProfile`.
- All records are provider-neutral.

Privacy implications: even normalized usage metadata is treated as potentially sensitive (see §17).

## 15. API design

Preferred approach: **extend the existing `/api/v1/analysis` response** with optional `usage` and optional `cost` fields.

- Do not create a separate "record usage" endpoint; the server records usage during analysis itself.
- Usage/cost fields must be optional so existing behavior and clients are unaffected.
- New payloads must pass schema validation and must never contain keys, Authorization headers, raw provider errors, or source content.
- Error behavior follows the existing safe pattern: stable error codes, no stack traces, no raw provider messages.

Deferred/optional: `GET /api/v1/usage/summary` for aggregates, if later evidence shows it is required.

## 16. UI/UX

Phase 12 starts with a **compact usage section inside the existing Jev result UI**. Minimum information:

- provider
- model
- input tokens
- output tokens
- total tokens
- estimated cost

Example:

```text
Usage

Model: Claude Sonnet

Input: 12,450
Output: 2,180
Total: 14,630

Estimated cost: $0.042
Pricing: v1
```

When unavailable:

```text
Input: Unavailable
Output: Unavailable
Cost: Unavailable
```

Rules:

- Do not invent values.
- Reuse the existing section-based rendering and styles; do not introduce a new visual system.
- Do not create a large analytics dashboard.

## 17. Security and privacy

Never store or expose:

- API keys
- provider secrets
- Authorization headers
- source code
- prompts
- file contents
- task text
- raw provider errors
- evidence content
- arbitrary provider response bodies

Safe usage metadata may include:

- `requestId`
- provider
- model
- input token count
- output token count
- total token count
- estimated cost
- currency
- pricing version
- timestamp
- status

Explicit statements:

- Usage metadata should be treated as **potentially sensitive telemetry**: model + frequency + timestamp combinations can reveal workflow information.
- Any future persistent storage must use bounded/controlled retention.
- The existing safe-logger discipline (`apps/jev-server/src/log.ts`) must be preserved; numeric usage fields are safe to log, but source, prompts, task text, and provider response bodies are not.
- The extension must never receive credentials, raw provider errors, or source context beyond what it already sends.

## 18. Error handling

- Usage/cost failures must never fail an otherwise valid analysis.
- Missing usage → `source: "unavailable"` on `ProviderUsage`.
- Unknown pricing → `CostEstimate.amount` unavailable.
- Malformed or contradictory usage from a provider is treated as unavailable, not guessed.
- Provider errors continue to be sanitized as today; usage recording must not surface raw provider messages.

## 19. Request lifecycle

Usage is recorded **only from validated provider responses**.

Cases to consider:

- **Successful request** — record usage if the provider supplied it.
- **Missing usage** — record `unavailable`.
- **Partial usage** — record only the fields supplied; the rest remain unavailable.
- **Malformed usage** — treat as unavailable; do not guess.
- **Failed request** — do not count as completed usage unless the provider supplies authoritative usage for it.
- **Retry** — correlate by `requestId`; avoid double counting.
- **Duplicate request** — de-duplicate on record write using `requestId`.
- **Streaming** — out of MVP scope; if usage is unavailable, record unavailable.
- **Provider timeout** — treat as a failed request; do not fabricate usage.

The existing `requestId` (generated per request in `apps/jev-server/src/app.ts`) is the correlation identifier.

## 20. Testing strategy

### Contract tests
- valid usage
- missing usage
- malformed usage
- negative tokens
- contradictory totals

### Provider tests
- Anthropic normalization
- OpenRouter normalization
- unavailable usage
- partial usage

### Cost tests
- input-only
- output-only
- input + output
- rounding
- unknown pricing
- versioned pricing
- model alias handling

### Security tests
- no API keys
- no Authorization headers
- no source code
- no prompt
- no raw provider error
- no unnecessary provider response data

### API tests
- optional usage response
- invalid payload rejection
- unavailable usage behavior

### UI tests
- usage displayed correctly
- estimated cost clearly labeled
- unavailable values displayed honestly

### Regression
- Existing 99/99 tests must remain green.

## 21. Implementation order

Recommended sequence for the future implementation phase:

1. Define normalized contracts.
2. Define pricing profile structure.
3. Capture Anthropic usage.
4. Capture OpenRouter usage.
5. Normalize provider usage.
6. Implement cost calculation.
7. Add in-memory usage recording.
8. Extend `/api/v1/analysis`.
9. Add compact UI usage section.
10. Add unit/provider/API/security tests.
11. Run the complete regression suite.
12. Perform security and privacy verification.
13. Perform real extension-host verification.
14. Commit Phase 12.

These steps are not performed by this document.

## 22. Acceptance criteria

### Functionality
- provider usage is normalized
- Anthropic usage is captured
- OpenRouter usage is captured
- missing usage remains unavailable
- cost can be estimated from versioned pricing
- unknown pricing remains unavailable
- analysis response can carry optional usage/cost
- UI displays compact usage information

### Accuracy
- no fabricated token values
- no fabricated costs
- estimated cost is clearly labeled
- pricing version is identifiable
- model alias handling is safe

### Security
- no secrets in usage records
- no source code in usage records
- no prompts in usage records
- no raw provider response stored
- safe logging preserved

### Architecture
- provider-neutral contracts
- no database introduced
- existing router architecture preserved
- extension remains presentation-focused

### Regression
- all existing tests remain green
- new Phase 12 tests pass
- real Extension Host verification passes

## 23. Risks

- **Provider token formats differ** → one normalized contract; adapters map; optional fields.
- **Cached or estimated token values** → `source` discriminator.
- **Model aliases** (for example `openrouter/free` resolving to a concrete model) → record requested and, when supplied, resolved model; key pricing to the resolved ID.
- **Changing provider pricing / pricing versions** → versioned profiles with `effectiveDate`.
- **Missing usage information** → explicit unavailable; never fabricate.
- **Streaming, retries, failed, partial responses** → record only validated, completed responses.
- **Duplicate requests** → correlate and de-duplicate by `requestId`.
- **Currency assumptions** → always carry `currency`; do not assume USD.
- **Inaccurate cost estimates** → label estimated; show pricing version; make no authoritative claims.
- **Privacy / excessive telemetry / sensitive metadata** → store numeric/short fields only; bounded retention; no task/source; safe logger.
- **Scope creep into a dashboard** → keep to a compact section plus optional, clearly labeled extras.

## 24. Dependencies

- Provider usage availability from the Anthropic SDK response — **READY** (SDK exposes usage; the adapter currently discards it).
- Provider usage availability from the OpenRouter response — **READY** (the response includes `usage`; the adapter currently ignores it).
- Pricing source and values — **NEEDS DECISION** at implementation time; the structure is approved (server-side, versioned, configuration-driven).
- Extension UI scope (compact block vs extras) — approved as compact section; extras are should-have.
- No fundamental architectural blocker identified.

## 25. Decisions

Locked and approved:

1. **Pricing:** server-side, versioned, configuration-driven. Not dependent on live provider billing APIs for the MVP. Unknown pricing → unavailable.
2. **Usage capture:** capture when the provider supplies it; normalize provider-neutrally; missing usage → unavailable, never zero. Initial providers: Anthropic, OpenRouter.
3. **Storage:** no database. Initial tracking is **in-memory server-side**. Persistent history is deferred. Extension `workspaceState` is not part of required Phase 12 scope unless separately approved.
4. **API:** extend `/api/v1/analysis` with optional usage/cost. No "record usage" endpoint. `GET /api/v1/usage/summary` is deferred/optional.
5. **UI:** compact usage section within the existing result UI. No large analytics dashboard.
6. **Cost labeling:** always "Estimated cost" unless authoritative billing data is introduced in a future, separately approved phase.

## 26. Rollback considerations

- Usage/cost are **optional** additions; removing them restores current behavior with no data migration, because no database is introduced and no persistent records are created.
- In-memory usage recording is process-local and disappears on restart, so there is no residual state to clean up.
- If pricing becomes a problem, unknown pricing already degrades safely to unavailable, so the feature can be disabled by configuration without code changes to the analysis path.
- Provider adapters must remain functional if usage capture is reverted, since usage is additive and optional.

## 27. Phase completion definition

Phase 12 is complete only when:

- all acceptance criteria in §22 are met;
- the full regression suite is green, including the existing 99/99 tests;
- security and privacy verification confirms no secrets, source, prompts, or raw provider responses are stored or logged;
- real Extension Host verification passes;
- Phase 12 is committed as its own focused commit.

Until then, Phase 12 is **formally planned but not implemented**.
