# Browser-level fixtures

Home for capture tests that need a real page rather than a synthetic DOM.

Unit tests live beside their source under `src/**/__tests__/` and run in happy-dom.
`vitest.config.ts` excludes `tests/**`, so nothing here runs in the unit suite.

## Fixture strategy

`fixtures/fake-saas/index.html` is a deliberately boring stand-in for a real SaaS
application. Public sites are unstable and unsafe as primary fixtures; this page is
versioned with the code, so a capture regression is always a code change and never a
third party redesigning their UI.

The page is built around the classification paths in
`src/core/capture/dom/sensitive.ts` — each credential field exercises a different signal
(input type, autocomplete, name wording, explicit `data-mimik-sensitive` opt-in) next to
ordinary fields that must keep recording normally.

The security invariant it exists to prove: **a value typed into `#credentials` must never
appear in a step description, a persisted `inputValue`, an export, or a model prompt.**

## Status

The fixture and this directory are the scaffolding. Driving it with Playwright is deferred
until the guide runtime work (WP-18) needs true end-to-end coverage; `playwright` is already
a devDependency. Until then the same invariants are covered by unit tests:

- `src/core/capture/dom/__tests__/sensitive.test.ts` — classification and DOM-context redaction
- `src/core/capture/events/__tests__/input-session.test.ts` — nothing secret leaves the page
- `src/entrypoints/background/__tests__/input-step-secrets.test.ts` — nothing secret reaches the database
- `src/core/guideme/__tests__/secret-replay.test.ts` — nothing secret is typed back into a live page
