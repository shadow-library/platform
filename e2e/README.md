# e2e

Cross-app Playwright smoke suite for the Shadow Library platform. Every base URL defaults to the local k3d
dev ingress (`*.shadow-apps.test`) and can be overridden via environment variables to point at any other
already-running deployment. Every spec skips cleanly, with a visible reason, when its product is opted out
for a given run.

## Configuration

Nothing is required for a normal local run — the four URLs already default to the local k3d ingress (see
`lib/env.ts`). Copy `.env.example` to `.env` only to override one, e.g. to point at a deployed environment
or to opt a product out.

`playwright.config.ts` parses `.env` itself (`lib/load-env.ts`, a small dependency-free `KEY=VALUE`
reader) rather than relying on Bun's automatic `.env` loading: Playwright's test workers run as separate
Node processes, and Bun's auto-load — which only applies to the process Bun itself starts — does not reach
them (confirmed empirically: a worker's `process.env` lacked vars a direct `bun -e` in the same directory
saw fine). Because `playwright.config.ts` is re-imported in every worker, loading `.env` there is what
actually lands the vars everywhere a spec reads them.

Each URL var has three states, not two:

| State | Effect |
| --- | --- |
| unset | falls back to the `.test` default |
| set to `""` (blank) | explicitly opted out — skips, never falls back to the default |
| set to anything else | overrides the default |

| Variable | Purpose |
| --- | --- |
| `E2E_IDENTITY_URL` | Base URL of the identity app. Default `https://identity.shadow-apps.test`. |
| `E2E_NOVEL_FORGE_URL` | Base URL of the Novel Forge app. Default `https://novel-forge.shadow-apps.test`. |
| `E2E_PULSE_URL` | Base URL of the Pulse app. Default `https://pulse.shadow-apps.test`. |
| `E2E_WEB_NOVEL_URL` | Base URL of the Web Novel app. Default `https://web-novel.shadow-apps.test`. |
| `E2E_STORAGE_STATE` | Path to a Playwright storage-state JSON for authenticated flows. Unset, or set to a path that doesn't exist, skips every authenticated spec. |

The local ingress presents a self-signed/local-CA cert, so `playwright.config.ts` sets
`ignoreHTTPSErrors: true` — not a production trust concern, since every target is either that local
cluster or a URL the caller explicitly overrode.

## Running

```sh
bun install                       # once, from the repo root
bunx playwright install chromium  # once per machine
cd e2e
bun run test                      # or: bunx playwright test
```

`verify` and `test` are deliberately split, the same way the SSR/SPA web apps do it (`e2e/.shadowrc.json`
sets `verify.test: false`, mirroring `apps/{identity,novel-forge,pulse}-web`):

- **`bun run verify`** — format + lint + type-check only. Static, no network, no browser. This is what CI's
  affected-workspace job runs, and it must stay green with zero reachable services: it never invokes
  Playwright, so a runner with no k3d cluster can't produce connection-error failures here.
- **`bun run test`** (equivalently `bunx playwright test`) — the actual live smoke suite. It needs either a
  reachable deployment (the local k3d ingress by default, or an env override) or explicit empty-string
  opt-outs for whichever products aren't reachable from wherever it's run — otherwise a spec that resolves
  a URL will genuinely try to hit it and fail on a real connection error, not skip.

## How skipping works

`lib/env.ts` exports typed accessors for the vars above plus a `skipUnless(condition, reason)` helper.
Specs call `requireProductUrl(product)` (or `requireStorageState()`) as their first line; it returns the
configured value or calls `test.skip(...)` with a human-readable reason, so a run against a partial
environment reports precisely which product/spec was skipped and why — never a silent pass.

## Specs

- **`web-reachability.spec.ts`** — for each configured product, the root navigates (following any
  server-side redirect) to a genuine 2xx response with a real rendered document (non-empty `<title>`). The
  baseline "does it load" check — deliberately just that, no body-text scanning for "error page" copy,
  which risks a false positive against a fiction-reading site's own content.
- **`health-not-exposed.spec.ts`** — always on (no opt-in) for every configured product: `GET
  /health/live` and `/health/ready` must not return the platform's raw `HttpCoreModule` health contract
  (a bare `text/*` body of `ok`/`not ready`) — that contract lives on a separate internal port
  (`health.port`, default 8081) by design, never the public app port an ingress fronts. Asserts on response
  shape, not status alone, because one product's SPA build answers any unmatched path with a `200
  text/html` catch-all shell — that's routing, not health exposure. See the spec's header comment for the
  per-product evidence this was verified against.
- **`auth-gate.spec.ts`** — an unauthenticated visit to one known-protected path per app lands on a URL
  containing `/login`.
- **`public-reading.spec.ts`** — Web Novel's public home renders behind the shared `<main>` landmark,
  whether the catalog has rows or shows an empty state.
- **`authenticated-placeholder.spec.ts`** — structural placeholder for phase-two session-backed flows;
  skips cleanly until `E2E_STORAGE_STATE` is set *and* points at a file that actually exists.

## Extending

Add new specs under `tests/*.spec.ts`. Reuse `lib/env.ts`'s accessors rather than reading `process.env`
directly, so every spec skips consistently and stays discoverable from one place. Authenticated flows
should request Playwright's `storageState` (via `requireStorageState()`) rather than logging in inline,
once a fixture-generation step exists to produce one.
