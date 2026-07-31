# e2e

Cross-app Playwright smoke suite for the Shadow Library platform. It targets **already-deployed**
services — there is no local compose deployment (see `../AGENTS.md`) — so every base URL arrives via
environment variables, and every spec skips cleanly, with a visible reason, when its product isn't
configured for a given run.

## Configuration

Copy `.env.example` to `.env` and fill in the base URLs you have. Bun loads `.env` automatically from this
directory's cwd for any script here (`bun run test`, `bunx playwright test`, ...) — no dotenv dependency
needed. Leaving a var unset is a deliberate, supported way to opt a product out of a run.

| Variable | Purpose |
| --- | --- |
| `E2E_IDENTITY_URL` | Base URL of the identity app. |
| `E2E_NOVEL_FORGE_URL` | Base URL of the Novel Forge app. |
| `E2E_PULSE_URL` | Base URL of the Pulse app. |
| `E2E_WEB_NOVEL_URL` | Base URL of the Web Novel app. |
| `E2E_API_HEALTH` | Set to `1` to opt into `api-health.spec.ts`'s `/health/live` + `/health/ready` checks. Unset (default) skips that file. |
| `E2E_STORAGE_STATE` | Path to a Playwright storage-state JSON for authenticated flows. Unset skips every authenticated spec. |

## Running

```sh
bun install                       # once, from the repo root
bunx playwright install chromium  # once per machine
cd e2e
bun run test                      # or: bunx playwright test
```

`bun run verify` runs format + lint + type-check + the suite, same as any other workspace. With no `.env`
present it's still green — every spec skips instead of failing.

## How skipping works

`lib/env.ts` exports typed accessors for the vars above plus a `skipUnless(condition, reason)` helper.
Specs call `requireProductUrl(product)` (or `requireStorageState()`) as their first line; it returns the
configured value or calls `test.skip(...)` with a human-readable reason, so a run against a partial
environment reports precisely which product/spec was skipped and why — never a silent pass.

## Specs

- **`web-reachability.spec.ts`** — for each configured product, the app root returns a 200-family
  response, renders a real document (non-empty `<title>`), and shows no browser/framework crash
  interstitial. The baseline "is it even up" check.
- **`api-health.spec.ts`** — for each configured product, `GET /health/live` and `GET /health/ready`
  against the platform's shared `HttpCoreModule` liveness/readiness contract. Gated behind
  `E2E_API_HEALTH=1`; a failure here (e.g. an ingress that doesn't proxy these paths) is a genuine finding
  about the deployment, left unsoftened.
- **`auth-gate.spec.ts`** — an unauthenticated visit to one known-protected path per app lands on a URL
  containing `/login` (a local login screen, or — for Novel Forge/Pulse — after a same-origin bounce to
  the backend's OIDC redirect and on to identity's hosted login).
- **`public-reading.spec.ts`** — Web Novel's public home renders behind the shared `<main>` landmark,
  whether the catalog has rows or shows an empty state.
- **`authenticated-placeholder.spec.ts`** — structural placeholder for phase-two session-backed flows;
  skips cleanly until `E2E_STORAGE_STATE` is provided.

## Extending

Add new specs under `tests/*.spec.ts`. Reuse `lib/env.ts`'s accessors rather than reading `process.env`
directly, so every spec skips consistently and stays discoverable from one place. Authenticated flows
should request Playwright's `storageState` (via `requireStorageState()`) rather than logging in inline,
once a fixture-generation step exists to produce one.
