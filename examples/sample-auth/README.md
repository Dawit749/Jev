# Sample auth project

This is a small repository for the Jev demo. It is intentionally inconsistent: password policy and persistence live in the API controller, while `src/application/authService.ts` is unused.

## Task

Open this folder in VS Code, focus `src/api/authController.ts`, and enter:

```text
Review the authentication change for architecture and security issues before I extend it.
```

## Expected behavior

With `ANTHROPIC_API_KEY` set and the Jev server running:

1. Jev collects the open file, nearby source, and a small project tree. It does not upload `.env`, keys, or dependency folders.
2. The model recommendation shows Jev fit scores. Scores are task fit, not benchmark claims.
3. Analysis runs on the configured Claude model.
4. A useful finding calls out business rules and persistence in the controller, with evidence, affected files, a confidence signal, and a short Why.
5. A non-blocking notification offers Review, Why, and Dismiss. Repeating the same finding immediately does not spam another notification.
6. Review shows severity, files, evidence, the recommendation, and Why. Dismiss hides that finding.

Claude's exact wording varies. The demo is successful when the finding is grounded in `src/api/authController.ts` and does not invent files.
