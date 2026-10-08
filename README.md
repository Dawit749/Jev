# Jev MVP v0.1

Jev is an AI engineering intelligence layer for software development environments. The MVP is a VS Code extension and a local API server. It helps a developer describe a task, collect a small amount of project context, and receive:

- a model recommendation with Jev fit scores
- technical findings with evidence
- a non-blocking notification
- a Review view
- a short Why, grounded in that evidence

Jev does not control Cursor's model selector, does not use private Cursor APIs, and does not modify files or run model-written commands.

## Layout

- `apps/jev-extension` — VS Code sidebar, context collection, and UI
- `apps/jev-server` — validation, model router, and the Claude adapter
- `packages/contracts` — shared request and response schemas
- `packages/shared` — path filtering and local URL checks
- `examples/sample-auth` — demo project
- `docs/` — product contract (the same documents also remain at the repository root)

## Setup

Requires Node.js 20 or newer.

```powershell
npm install
Copy-Item .env.example .env
```

Set `ANTHROPIC_API_KEY` in `.env`. The server reads that file. The extension never receives the key.

The configured model defaults to `claude-sonnet-5-5`. Change `ANTHROPIC_MODEL` if you need a different Claude model id. Do not scatter model ids through the UI.

OpenRouter is an optional, cost-conscious provider path. Set `OPENROUTER_API_KEY` in `.env` and start with `JEV_PROVIDER=openrouter` to route analysis through OpenRouter instead of Anthropic. The default OpenRouter model is `openrouter/free`; change `OPENROUTER_MODEL` to use a different OpenRouter model id. Only one provider is active at a time, and the Model Advisor describes the analysis with whichever provider is configured.

Start the local server from the repository root:

```powershell
npm run dev:server
```

The server listens on `http://127.0.0.1:8787` only.

In VS Code, open this repository and choose **Run and Debug → Run Jev Extension**. In the Extension Development Host, open Jev from the activity bar, or run **Jev: Open**.

`JEV_PROVIDER=fake` starts a local stub that is not Claude. Use it only to exercise the UI without a key. The sidebar labels that run as **Local stub**.

## Demo

1. Open `examples/sample-auth` in the Extension Development Host, or add it to the workspace.
2. Open `src/api/authController.ts`.
3. In Jev, enter: `Review the authentication change for architecture and security issues before I extend it.`
4. Choose **Analyze**.
5. Read the model recommendation and finding, then use **Review** and **Why**.
6. Dismiss the notification or the finding. A repeat of the same finding is throttled.

Details and the expected finding are in [examples/sample-auth/README.md](examples/sample-auth/README.md).

## Checks

```powershell
npm run check
```

That typechecks, lints, and runs the tests. Tests do not call Anthropic.

## Limits

The MVP recommends a model. It does not switch models in the editor. GPT and Gemini appear as fit comparisons and are marked not connected. Only the configured provider is invoked — Claude by default, or OpenRouter when `JEV_PROVIDER=openrouter` — and only when the server has that provider's key.

## Known limitations

- A live Claude request is only possible when `ANTHROPIC_API_KEY` is set in the server environment. Automated tests use a local stub or an injected completion client.
- Manual VS Code Extension Development Host verification is a separate step. Automated tests cover sidebar HTML states, session flow, and notifications.
- Git history is not checked automatically. Keep `.env` out of commits; `.gitignore` excludes it.
- Prompt-injection defenses separate system instructions from untrusted repository content. They do not prove protection against every live-model jailbreak.
- Finding evidence validation uses token overlap with the supplied context, plus a small fixed unsupported-claim list.
- When no provider is connected, the Model Advisor still ranks profiles. The top score may be a disconnected future provider such as GPT or Gemini, with `available: false`.
- Saving a file can refresh notification identity from a local content hash. It does not call Claude by itself.
- HTTPS for a non-local Jev server is not an MVP deployment mode. The server binds loopback only.
