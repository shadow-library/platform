# `@shadow-library/modules` — Task List

|                     |                                                                                                                                         |
| :------------------ | :-------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**          | Approved for development                                                                                                                |
| **Created**         | 2026-07-25                                                                                                                              |
| **Source of truth** | `identity/architecture-v1.1-rollout.md` (contract-first pipeline) · ecosystem skill `references/repository-setup.md` (Container builds) |

_(This work was initially slated for `@shadow-library/fastify`, but the OpenAPI document is assembled
here — `src/http-core/services/open-api.service.ts` in `HttpCoreModule` — so the task lives in this
repo.)_

## M-1 — Stamp the build commit into the served OpenAPI document · S

- **Change:** the served OpenAPI document's `info` block is whatever the consuming app passes to
  `HttpCoreModule.forRoot({ openapi })` (`OpenAPIOptions extends Partial<OpenAPIV3.Document>`) —
  nothing ties a served contract to the code revision that produced it.
- **Why:** the ecosystem's contract pipeline pulls `openapi.json` from **deployed dev instances**, not
  from a versioned artifact — the auth SDK and the web apps generate their API types from whatever the
  deployment serves. The commit stamp is what makes that pull model auditable: every generated
  artifact can name the exact server commit it was derived from.
- **Fix:** register an `APP_VERSION` env key through `Config` (config record `app.version`). When the
  consuming app does not explicitly set `openapi.info.version`, default it to that value; fall back to
  `local` when unset. The conventional value is the **7-character head commit**
  (`git rev-parse --short=7 HEAD`), baked into the image at build time via a Docker build argument —
  the mandatory build convention lives in the ecosystem skill (`repository-setup.md`, Container
  builds). Read the value through `Config`, never `process.env`.
- **Consumers:** SDK codegen and `shadow gen-api-types` should record `info.version` alongside their
  generated output, so a generated type set carries the server commit it came from.
- **DoD:** an app booted with `APP_VERSION=abc1234` and no explicit `info.version` serves
  `"info": { "version": "abc1234" }`; an explicitly passed `info.version` still wins; unset env yields
  `local`; behaviour documented in the module README.
