# AI testing

Manual test recipes for every AI feature of Novel Forge: the input to use and what to verify, so you can tell whether a feature works as intended. Recipes come from reading the code, not from running it; anything marked UNVERIFIED could not be confirmed.

## How to use this doc

1. Do Part 1 (setup) once: services, environment, authentication and how to read what the harness sent.
2. Run recipes in order within a part. Later recipes assume the project state earlier ones create; each block names its preconditions.
3. "The harness" means the AI orchestration around the models: prompts, context packs, LangGraph graphs, judge and repair, and model routing.

| Part                                  | Features                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Part 1: setup and observability       | Run locally, AI env vars, auth, project creation, reset between runs, observability                                            |
| Part 2: Idea to lore bible            | Ideation Studio (the Idea), graduation, premise enhancement, bible builder, readiness, audit, one end-to-end sample            |
| Part 3: planning, generation          | Volume and arc planning, briefs, chapter generation, judge and repair, revise, finalize, continuity, validation, insert, amend |
| Part 4: manuscript pipelines          | Novel import, extraction, recombine, rebrand, reforge (chapter and transform), translation, curated ingest                     |
| Part 5: chat hub and admin inspection | Chat hub, illustrations, plugins, AI settings and quota, admin inspection (runs, context packs, model calls)                   |

## Recipe format

Each block gives: Entry (UI screen or route), Preconditions, Input (literal text to paste), Run, Verify (UI, database rows, run and model-call evidence, plus a quality check a human can judge) and Fails when (symptoms and where to look).

## Known gaps that affect testing

Several features are reachable only through the API, and some observability is incomplete; each recipe says so where it matters. The most important:

- Bible rebuild, premise enhancement, `POST /finalize` and `POST /validate` have no web caller.
- The judge and repair loop is not reachable from the UI: the client never sends `autoFix`, which defaults to off.
- `cost_usd` is recorded only for image calls, so every cost figure understates spend.
- The admin scope `novel-forge:admin`, needed to read prompts and context packs, is missing from the role catalog.
- Source extraction cannot run today: its prompt needs two variables the graph never supplies.

The full list is in the "Findings" sections of each part.

---

## Part 1: setup and observability

All paths are relative to the repository root; a bare `src/…` or `.env.example` means the one under
`apps/novel-forge-server`. Every claim carries a `path:line` so you can re-check it rather than trust it.

**Shortest path to a working environment: §10.** Read §3 first — authentication is the only step that can stop
you before the server boots, and it is the one that decides whether you test through the browser or with a
bearer token.

The old `apps/novel-forge-server/README.md` (readable at `git show 5a5c3565^:apps/novel-forge-server/README.md`)
is **stale in three places** — see "Where the old README is wrong" at the end. Trust `src/bootstrap.ts` and
`.env.example`, not the README.

---

### 0. What you actually need running

| Piece                          | Required for                  | Hard-fails without it?                                                                                                                                 |
| ------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Postgres 16+ **with pgvector** | everything                    | yes — `generated/drizzle/0000_initial_schema.sql:1` is `CREATE EXTENSION IF NOT EXISTS vector;`, and `vector(1024)` columns exist at `:597` and `:651` |
| `novel-forge-server` on :8080  | every API call                | yes                                                                                                                                                    |
| `novel-forge-web` on :3000     | UI recipes only               | no — every recipe has an API path                                                                                                                      |
| An **identity** deployment     | booting the server at all     | **yes** (see §3)                                                                                                                                       |
| `AI_OPENROUTER_API_KEY`        | every chat/image model call   | yes — `AI_006` / `AI_004`, `src/classes/app-error-code.ts:97,99`, thrown at `src/modules/ai/model-router.service.ts:280-281` and `:487-488`            |
| Ollama on :11434               | lore/prose vector search only | **no — it degrades silently** (§6)                                                                                                                     |

There is **no docker-compose, Tiltfile or skaffold in this repo** (`AGENTS.md:25`, `AGENTS.md:71`: "there is no
local compose deployment"). Only per-app `Dockerfile`s exist. The provided local stack is a k3d cluster driven by
an external `gitops` CLI in a separate devops repo — `.claude/skills/shadow-library-ecosystem/references/repository-setup.md:245-267`
(`gitops up dev`; `gitops build novel-forge-server novel-forge-web --no-commit --deploy`). It serves
`https://novelforge.shadow-apps.test` and exposes Postgres on host port **7070** (`e2e/.env.example:42-46`).

Two viable setups:

- **A — cluster**: `gitops up dev`, then `gitops build … --deploy`. Everything (identity, Postgres, storage) is
  already wired. Slowest to iterate, but nothing to configure.
- **B — host**: run the two apps with `bun run dev` against the cluster's Postgres on 7070 (or your own pgvector
  Postgres) and the cluster's identity. This is the one worth setting up for repeated AI testing, because you get
  `LOG_LEVEL=debug`, which is the only way to see the full prompt input and raw model output (§7). Its one real
  obstacle is browser login: the cluster's identity has no localhost redirect URI registered, so plan on a bearer
  token or on adding that URI at identity (§3).

---

### 1. Ports and start commands

| Process       | Command (cwd)                               | Port | Evidence                                                                                           |
| ------------- | ------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------- |
| server        | `cd apps/novel-forge-server && bun run dev` | 8080 | `apps/novel-forge-server/package.json:8` (`bun run --watch src/main.ts`); `src/bootstrap.ts:43-44` |
| server health | —                                           | 8081 | `packages/modules/src/http-core/http-core.constants.ts:29` — but see below                         |
| web           | `cd apps/novel-forge-web && bun run dev`    | 3000 | `apps/novel-forge-web/vite.config.ts:24`                                                           |

The health port is **not open in a dev run**: `health.enabled` defaults to `Config.isProd()`, i.e. `false` unless
`NODE_ENV=production` (`http-core.constants.ts:30`, read at `services/health.service.ts:32-40`). Do not wait on
`:8081/health/ready` locally — watch the server's own startup log instead.

Vite proxies `/api` → `API_ORIGIN || http://localhost:8080` with `changeOrigin` (`vite.config.ts:8,24`), so the
browser is same-origin and session + CSRF cookies work. Leave `API_ORIGIN` unset locally.

**Port clash warning:** `identity-server` also defaults to `SERVER_PORT=8080` (`apps/identity-server/.env.example:55`)
and `identity-web` also uses 3000. If you run identity on the host, move one of them and point `AUTH_ISSUER` at the
port you chose.

OpenAPI is served **only when `NODE_ENV=development`** at `/dev/api-docs/openapi.json`
(`packages/modules/src/http-core/http-core.module.ts:62,101`; the gate is `Config.isDev()`,
`packages/common/src/services/config.service.ts:318-319`; the path is also `scripts/gen-api-types.ts:41,59`).
`NODE_ENV` itself defaults to `development` (`config.service.ts:96`), so this surface is on unless you set the
variable to `production`. It is your route reference and the source for `bun scripts/gen-api-types.ts`.

---

### 2. Database

```bash
# from the repo root
bun run db apps/novel-forge-server migrate          # scripts/db.ts:113-117 → runs src/migrate.ts in the workspace
bun run db apps/novel-forge-server create-template  # scripts/db.ts:127-166 → builds <db>_template for the test suite
bun run db apps/novel-forge-server generate         # scripts/db.ts:107-111 → drizzle-kit generate, no DB needed
```

`bun run db` is the root alias for `bun scripts/db.ts` (root `package.json:38`), so both spellings work — but only
from the repo root. `scripts/db.ts:41` — the only commands are `generate | migrate | create-template | seed`.
**There is no `reset` and no `drop`.** The workspace argument may be the directory (`apps/novel-forge-server`) or
the package name (`@shadow-library/novel-forge-server`) (`scripts/db.ts:31,205`).

- `src/migrate.ts:15-16`: URL from `DATABASE_POSTGRES_URL`, default `postgresql://postgres:postgres@localhost/novel_forge`;
  migrations folder from `MIGRATIONS_FOLDER`, default `generated/drizzle` (relative to cwd — run it via `scripts/db.ts`,
  which sets `cwd` to the workspace).
- `src/migrate.ts:25-26` also runs `PostgresSaver.setup()`, which creates the LangGraph checkpoint tables. Skip this
  and every graph run dies on its first checkpoint write.
- `bun run db … seed` runs `tests/fixtures/seed.ts`, which exports **an empty function** and calls nothing at the
  top level (`tests/fixtures/seed.ts:3-5`), so the command is a no-op. There is no sample-data seeder.
- `create-template` reads `DATABASE_POSTGRES_URL` from the workspace's own `.env` when it is not already in the
  process env (`scripts/db.ts:60-70,74-75`), so set it there before running it.
- The DB user needs `CREATE EXTENSION` and (for `create-template`) `CREATEDB`.

pgvector image: CI runs `pgvector/pgvector:pg18` (`.github/workflows/ci.yml:263`) — the simplest thing to point a
local Postgres at too. The k3d cluster's image lives in the devops repo and is not knowable from here.

---

### 3. Authentication — the part that blocks you

There is **no dev auth bypass** in `apps/novel-forge-server/src` or `packages/auth/src`. Every `/api/v1` route is
`@Authenticated()` (`src/modules/project/project/project.controller.ts:23`,
`src/modules/generation/generation.controller.ts:61`).

Worse for a host setup: **the server refuses to boot without a reachable identity.**
`packages/auth/src/module/auth.module.ts:66-79` — `onModuleInit` calls `sessions.warmUp()` when browser login is
enabled (`:75`), then `client.syncRoles(...)` (`:78`) and `client.loadServiceAccess()` (`:79`). The comment at
`:70-74` is explicit: this exists so a misconfiguration is a boot failure rather than a 401 later. Novel Forge
always declares a role catalog, so `syncRoles` runs on every boot regardless of the browser flow — an unreachable
identity fails the boot either way.

Browser login turns on whenever a client id resolves, and `AUTH_APP_ID` doubles as that id
(`packages/auth/src/module/config.ts:208-211,231`) — so setting `AUTH_APP_ID` alone is enough to arm `warmUp()`,
which then fails without a usable `AUTH_CLIENT_SECRET`. Leaving the secret blank does not quietly disable the
browser flow; it breaks the boot.

Module wiring: `src/modules/auth/auth.module.ts:10` —
`AuthModule.forRoot({ roles: NOVEL_FORGE_ROLE_CATALOG, routes: { basePath: '/api/auth' } })`.

#### Env vars (declared in `packages/auth/src/module/config.ts:146-173`)

| Var                          | Meaning                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `AUTH_ISSUER`                | identity's issuer URL. `.env.example:73` ships `https://identity.shadow-apps.com` |
| `AUTH_APP_ID`                | `novel-forge` — this app's id and OAuth client id (`.env.example:74-75`)          |
| `AUTH_CLIENT_SECRET`         | **required to boot** (`.env.example:76-79`)                                       |
| `AUTH_CLIENT_ASSERTION_PATH` | in-cluster alternative to the secret                                              |
| `AUTH_IDENTITY_URL`          | back-channel URL; unset outside a cluster                                         |
| `AUTH_BROWSER_LOGIN`         | default `true` (`config.ts:166`)                                                  |
| `AUTH_SESSION_COOKIE_NAME`   | default `__Host-shadow-session`                                                   |
| `AUTH_SESSION_COOKIE_SECURE` | default `true`                                                                    |
| `AUTH_STRICT_SCOPES`         | default `false`                                                                   |

Audience (`api://novel-forge`), redirect URIs and granted scopes are **not** configured here — they are read back
from identity's `GET /api/v1/apps/me` (`.env.example:69-72`).

#### Plain-HTTP localhost caveat

`packages/auth/src/module/cookie.ts:40-44` throws a config error if a `__Host-` cookie name is paired with
`secure=false`. For host-run HTTP you must set **both**:

```
AUTH_SESSION_COOKIE_SECURE=false
AUTH_SESSION_COOKIE_NAME=shadow-session
```

(the same pairing `apps/web-novel-server/.env.example:22-25` documents).

#### CSRF

Cookie-authenticated mutations need the double-submit pair: cookie `csrf-token` = `<expiry>:<token>` plus header
`x-csrf-token: <token>` (`packages/modules/src/http-core/http-core.module.ts:26-28`). The token is readable from
`GET /api/auth/session`: split the cookie on `:` and send the second half in the header, as the e2e helper does at
`e2e/tests/novel-forge/ai-pipeline.spec.ts:31-36`. Bearer-token callers do not need it.

#### How to get a credential

1. **Browser.** Open `http://localhost:3000` → `/login` redirects to `/api/auth/login`
   (`apps/novel-forge-web/src/routes/login.tsx:26-31`) → identity → `/api/auth/callback` → session cookie.
   The SDK picks the redirect URI from identity's registration: the candidate whose pathname is
   `/api/auth/callback`, preferring the one whose origin matches the request
   (`packages/auth/src/module/app-session.service.ts:470-488`).
   Identity seeds `http://localhost:8080/api/auth/callback` next to the public one, but **only when identity itself
   is not running as production** (`apps/identity-server/src/modules/bootstrap/ecosystem-seed.service.ts:68-75`,
   path from `apps/identity-server/src/modules/auth/oauth/oauth.constants.ts:8`) — and the identity image pins
   `NODE_ENV=production` (`apps/identity-server/Dockerfile:48`). **So the k3d cluster's identity registers only
   `https://novelforge.shadow-apps.test/api/auth/callback`**, and a host-run server pointed at it sends you to the
   cluster app rather than your own. Either add the URI at identity —
   `PATCH /api/v1/admin/clients/:clientId {"redirectUris":[…]}`, needs `clients:manage` + elevated
   (`apps/identity-server/src/modules/admin/admin-client.controller.ts:118-127`; any fragment-free absolute URI is
   accepted, `apps/identity-server/src/modules/auth/oauth/oauth-client.service.ts:464-474`) — or use a bearer
   token (2). Two further traps once the URI exists: the callback lands on the **server's** origin (`:8080`), so
   navigate back to `http://localhost:3000` afterwards (cookies are not port-scoped); and the origin match compares
   `protocol://hostname` with the port dropped (`packages/auth/src/module/auth.controller.ts:247-250`; Fastify 5's
   `request.hostname` excludes the port), so with two callback candidates registered it matches neither and falls
   back to the first, logging "several registered redirect uris point at the callback route".
2. **Bearer token (most reliable off-cluster).** Any JWT identity issues for audience `api://novel-forge`, verified
   against identity's JWKS (`packages/auth/src/module/auth-guard.ts:109-114`). Grab one from a browser session on
   the cluster app, or mint it at identity. Bearer callers skip the CSRF pair entirely.
3. **Bot key** (`sl_bot_…`) — exchanged with identity via `resolveBotKey` (`auth-guard.ts:113,133-138`). Refused
   on routes with no `@BotPermission` and on elevated routes, so it cannot reach `GET /runs/:runId` (admin-only, §7).
4. **Test IdP — test process only.** `tests/test-idp.ts` uses `createTestIdP` from `@shadow-library/auth/testing`
   and seeds an ephemeral issuer plus `CLIENT_SECRET='test-client-secret'` into the Config cache (`:43-45`);
   `issueTestToken` mints `sub='42'`, aud `api://novel-forge`, org `org-test` (`:14-26,53-55`). The mock IdP lives
   **inside** the test process, so it cannot authenticate a `bun run dev` server.

#### Permissions you need

`src/modules/auth/role-catalog.constants.ts:23-69`. The default `NovelForgeAuthor` role holds
`projects:read`, `projects:write`, `illustrations:write`, `generation:run` — **but not** `ADMIN_PERMISSION`.
The three harness-observability routes are `@RequirePermission(ADMIN_PERMISSION, { highRisk: true })`
(`src/modules/generation/generation.controller.ts:328-329,343-344,350-351`), so **your test user must be an
admin** or you inspect `model_calls` in SQL instead.

e2e personas, once the e2e seed has been run against that identity: `e2e.user1@shadow-apps.test` /
`e2e.user2@shadow-apps.test` with password `E2eSeed#Passw0rd!` (`e2e/lib/personas.ts:63,80-81,90-91`), and the
bootstrap admin `admin@shadow-apps.com` — the account that already holds the admin roles — forced to
`E2eAdmin#Passw0rd!` (`e2e/lib/personas.ts:66,68-69,98`). The admin persona is the one that can reach the
harness-observability routes below.

---

### 4. Every env var that matters for AI

This app's own config keys are declared in `apps/novel-forge-server/src/bootstrap.ts`; the env-var spelling is the
key upper-snaked (`ai.openrouter.api.key` → `AI_OPENROUTER_API_KEY`). The rows whose "Declared" column names
`config.service.ts` come from `@shadow-library/common`, and the `STORAGE_*` and `DATABASE_*` keys from
`@shadow-library/modules` — none of those appear in `bootstrap.ts`.

| Env var                             | Default                                          | Declared                                    | What it changes                                                                                                                                    |
| ----------------------------------- | ------------------------------------------------ | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                          | `development`                                    | `config.service.ts:96`                      | the real dev switch: gates OpenAPI, the health port, and the `LOG_LEVEL` default                                                                   |
| `APP_STAGE`                         | `prod`                                           | `packages/common/.../config.service.ts:105` | changes nothing here — its only reader is `Config.isProductionDeployment()` (`:333-334`), which no `novel-forge-server` or `packages/*` path calls |
| `LOG_LEVEL`                         | `debug` when `NODE_ENV=development`, else `info` | `config.service.ts:107`                     | **keep it `debug`** — the full prompt input and raw output only ride on debug (§7)                                                                 |
| `SERVER_PORT` / `SERVER_HOST`       | `8080` / `0.0.0.0`                               | `bootstrap.ts:43-44`                        |                                                                                                                                                    |
| `DATABASE_POSTGRES_URL`             | `…@localhost:7070/novel_forge` in the example    | `.env.example:14`                           | pgvector required; `src/migrate.ts:15` falls back to the same DSN without the port                                                                 |
| `AI_OPENROUTER_API_KEY`             | —                                                | `bootstrap.ts:46`                           | **every** chat and image model; absent → `AI_006`                                                                                                  |
| `AI_OPENROUTER_API_URL`             | `https://openrouter.ai/api/v1`                   | `bootstrap.ts:47`                           | point at any OpenAI-compatible gateway                                                                                                             |
| `AI_OLLAMA_HOST`                    | `http://localhost:11434`                         | `bootstrap.ts:48`                           | embeddings only                                                                                                                                    |
| `AI_EMBEDDING_MODEL`                | `qwen3-embedding:8b`                             | `bootstrap.ts:49`                           | **pinned to 1024 dims** by the `vector(1024)` columns — do not swap                                                                                |
| `AI_LLM_TIMEOUT_MS`                 | `300000`                                         | `bootstrap.ts:50`                           | per-call budget (`model-router.service.ts:186`)                                                                                                    |
| `AI_LLM_MAX_RETRIES`                | `2`                                              | `bootstrap.ts:51`                           | **transport** retries only → 3 attempts (`model-router.service.ts:609-630`)                                                                        |
| `AI_LLM_BACKOFF_MS`                 | `500`                                            | `bootstrap.ts:52`                           | exponential                                                                                                                                        |
| `AI_QUOTA_WINDOW_MS`                | `3600000`                                        | `bootstrap.ts:53`                           | rolling window, per project owner                                                                                                                  |
| `AI_QUOTA_MAX_CALLS`                | `1000`                                           | `bootstrap.ts:54`                           | **set `0`** locally                                                                                                                                |
| `AI_QUOTA_MAX_COST_USD`             | `50`                                             | `bootstrap.ts:55`                           | **set `0`** locally                                                                                                                                |
| `AI_LANGSMITH_API_KEY`              | —                                                | `bootstrap.ts:56`                           | **does nothing** — loaded but read nowhere in `apps/` or `packages/`, and LangChain ignores the `AI_` prefix (§7)                                  |
| `LANGSMITH_TRACING`                 | `false`                                          | `.env.example:41`                           | LangChain's own switch — pair it with LangChain's own `LANGSMITH_API_KEY` (§7)                                                                     |
| `PROJECTS_MAX_PER_OWNER`            | `100`                                            | `bootstrap.ts:58`                           | `0` disables; breach → `PRJ_004`                                                                                                                   |
| `PUBLISHING_AUTO_PUSH`              | `true`                                           | `bootstrap.ts:60`                           | **set `false`** with no reader service                                                                                                             |
| `GENERATION_RECONCILIATION_CADENCE` | `5`                                              | `bootstrap.ts:62`                           | finalized chapters between automatic arc re-outlines                                                                                               |
| `PLUGINS_DIR`                       | `''`                                             | `bootstrap.ts:64`                           | **leave empty** (§9)                                                                                                                               |
| `STORAGE_DRIVER`                    | `s3` in the example                              | `.env.example:46`                           | **set `local`** off-cluster; declared by `StorageModule`, not `bootstrap.ts`                                                                       |
| `STORAGE_LOCAL_DIR`                 | `./storage-data`                                 | `.env.example:58`                           |                                                                                                                                                    |
| `STORAGE_PUBLIC_ORIGIN`             | —                                                | `.env.example:47`                           | the origin image URLs are resolved against                                                                                                         |

#### Model groups and defaults — there is no env var for these

Model selection is **code + database**, not environment.

- Roles → groups: `src/modules/ai/defaults.ts:42-72`. `bible`, `plan`, `outline`, `arc`, `skeleton`, `premise`,
  `extraction` all map to **`planning`**.
- Production group defaults (`defaults.ts:85-95`):
  `writing` → `moonshotai/kimi-k3`, `planning` → `z-ai/glm-5.2`, `review` → `anthropic/claude-sonnet-5`,
  `chat` → `z-ai/glm-5.2`, `helper` → `openai/gpt-5.6-luna`, `image` → `x-ai/grok-imagine-image-2.0`,
  `vision` → `openai/gpt-5.6-luna`, `embedding` → `ollama qwen3-embedding:8b`, `ideation` → `anthropic/claude-opus-5`.
- Unrestricted map (`defaults.ts:101-111`) applies when `project.contentMode === 'unrestricted'`; overrides are
  clamped to `UNRESTRICTED_LLM_ALLOWLIST` (`defaults.ts:117`).
- Reasoning effort per group: `REASONING_POLICY` (`defaults.ts:142-152`) — every authoring group asks for `low`.
  **Watch out:** `resolveReasoningEffort` (`defaults.ts:157-165`) omits the field entirely when the model's
  registry entry does not list the policy effort and its mode is `optional`. `z-ai/glm-5.2` lists only
  `['xhigh','high']` (`src/modules/ai/models.ts:204`), so the default planning model runs with **reasoning off**.
- Registry of selectable models: `src/modules/ai/models.ts:41-247`. Every LLM id is an OpenRouter `vendor/model`
  slug and its `provider` must be `openrouter`.

Three ways to override, in precedence order (`model-router.service.ts:229-249`):

1. **Per project, per role** — `PATCH /api/v1/projects/:id` with
   `{"config":{"models":{"bible":{"provider":"openrouter","model":"anthropic/claude-opus-5"}}}}`.
   Field list: `src/modules/project/project/project.dto.ts:52-...` (`ProjectModelOverrides`, `bible` at `:89-90`).
   Validated at write time by `isRegisteredModel` (`src/modules/project/project/project.service.ts:80-83`) →
   a wrong provider or unknown id gives `AI_002`.
2. **Per account, per group** — `PUT /api/v1/ai/settings` `{"models":{"planning":{...}}}`
   (`src/modules/ai/ai.controller.ts:20-24`; groups at `src/modules/ai/account-settings.service.ts:18`).
3. Otherwise the production/unrestricted group default.

`GET /api/v1/ai/models` (`ai.controller.ts:26-54`) returns the whole registry with prices, context windows and both
default maps — the quickest way to see what is selectable.

> **Stale helper:** `e2e/tests/novel-forge/forge-helpers.ts:75` pins `{provider:'anthropic', model:'claude-haiku-4-5'}`.
> That id is not in `MODEL_MAP` and the provider is not `openrouter`, so a PATCH with it now returns `AI_002`
> (`project.service.ts:80-83`). Do not copy it.

---

### 5. Creating a project

`POST /api/v1/projects` — `src/modules/project/project/project.controller.ts:29` (201, `ProjectResponse`).

Body (`project.dto.ts:16-39`): required `name` and `kind`; optional `title`, `instructions`, `contentMode`,
`originalLanguage`.

- `kind` enum: `source | new_novel | translation | curated` (`src/database/schemas/projects.ts:69`).
  `curated` is refused with `PRJ_005` (`project.service.ts:103`) — it only arrives via ingest.
- `contentMode`: `standard | unrestricted` (`projects.ts:74`).
- `originalLanguage` is required for `translation` and rejected otherwise — the check is exclusive-or, so setting
  it on any other kind is also a `PRJ_006` (`project.service.ts:34-36,104`).
- A new project's `status` is `active`; only Ideation Studio seeds are `seed`, and `status` is not a
  `CreateProjectBody` field, so no HTTP caller can mint one (`project.service.ts:101`).
- A `new_novel` create also inserts blank placeholder bible documents (`project.service.ts:129-134`) — these carry
  no `contentHash`, which is how the plan importer tells them from authored docs
  (`src/modules/plan-import/plan-import.service.ts:114-120`).

**For AI testing use `kind: "new_novel"`.** The bible builder's `assertAuthoringProject` gate
(`src/modules/generation/generation.service.ts:189-193`) rejects anything else with `PRJ_009`, and the plan importer
requires `new_novel` outright (`plan-import.service.ts:43`, `PRJ_003`).

Then set the brief — it is a separate `PATCH`, not part of create:

```
PATCH /api/v1/projects/:id   {"brief": "<your premise>"}
```

(`project.dto.ts:201-202`). The Story Bible screen refuses to run without one
(`apps/novel-forge-web/src/routes/novels/$novelId/story-bible.tsx:541-543`).

**UI equivalent:** `apps/novel-forge-web/src/features/projects/NewNovelModal.tsx` — the "Direct" door posts
`{name, title, kind:'new_novel', contentMode}` (`:77-95`); "Translate" posts `kind:'translation'` (`:97-116`);
"Idea" posts to `/api/v1/seeds` and creates a seed-status project (`:118-130`). Screens are declared once in
`apps/novel-forge-web/src/components/Layout/screens.tsx:53-72`, each with a `workflows` filter; for a `new_novel`
project the visible labels are **Overview**, **Story Bible**, **Canon Facts**, **Volumes & Arcs**, **Import Plan
(deprecated)**, **Chapters**, **Illustrations**, **Review Queue**, **Refinement Chat**, **Proposals**, **Workflow
Runs** (admin-only, `adminOnly: true` at `:69`), **Publish**, **Project Settings**. The `translation`, `source`,
`rebrand`, `reforge` and `transform` screens never appear on a `new_novel` project (`AUTHORING` is
`['new_novel', 'source']`, `:28`).

**Content without AI:** `POST /api/v1/import` takes a hand-written `novel-import` bundle; a minimal valid one is
built by `buildFinalBundle` at `e2e/tests/novel-forge/forge-helpers.ts:119`. Useful when you need chapters to
exist but do not want to pay for generation.

---

### 6. Ollama / embeddings — read this before you conclude retrieval is broken

- Client: `src/modules/ai/retrieval/embedding.service.ts:14` — `new Ollama({ host: Config.get('ai.ollama.host') })`.
- **`embed()` catches every error, logs a `warn`, and returns `null`** (`embedding.service.ts:19-27`).
  `embedBatch` returns nulls (`:31-37`).
- Indexing writes the chunk anyway with `embedding: null` (`src/modules/ai/retrieval/indexing.service.ts:27-49` for
  prose, `:58-68` for lore).
- Retrieval returns `[]` on a null embedding or any error (`src/modules/ai/retrieval/retrieval.service.ts:36-72,102-103`).
- The bible builder's final node wraps `addLore` in its own try/catch and calls the failure non-fatal
  (`src/modules/ai/graphs/bible-builder.graph.ts:247-258`).

**Consequence:** with Ollama down, every AI workflow still reports success, the outline pack's
`## LORE REFERENCES` / `## PROSE REFERENCES` sections are simply absent
(`src/modules/ai/context/context-assembler.service.ts:704-719`), and `search_lore` answers "No lore found.".
Nothing in the UI tells you. If you are testing anything retrieval-shaped, **start Ollama first**:

```bash
ollama pull qwen3-embedding:8b && ollama serve   # must stay on :11434
```

and re-run the bible builder afterwards (indexing only happens during a run), or the previously written docs stay
unindexed. The repair rules differ by kind:

- **Lore** self-heals. `addLore` upserts on `(projectId, kind, refKey)` and writes `embedding` in the `set` clause
  (`indexing.service.ts:58-68`), so re-running the bible builder overwrites a null embedding in place.
- **Prose does not.** `backfill` skips every chapter that already has any `chapter_chunks` row, null embeddings
  included (`indexing.service.ts:87,93`). The only repair is `addProse`, which deletes the chapter's chunks first
  (`:33`) and runs when the chapter is re-indexed by a finalize — so re-finalize the chapter, or delete its
  `chapter_chunks` rows by hand before calling backfill.

---

### 7. Observability — how to see what the harness actually sent

**Set `LOG_LEVEL=debug`.** These are the lines that matter, all in `src/modules/ai/model-router.service.ts`:

| Line       | Level       | Contents                                                                                                                           |
| ---------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `:355-366` | debug       | `structured: invoking model` — role, provider, model, **promptKey, promptVersion**, runId, node, and the **full rendered `input`** |
| `:404`     | debug       | `parsed on first attempt` + `outputLength`                                                                                         |
| `:413`     | warn        | `Attempt 1 parse failed — repairing` + the schema issues (visible even in prod)                                                    |
| `:414`     | debug       | `Attempt 1 raw output`                                                                                                             |
| `:427`     | debug       | `parsed after repair`                                                                                                              |
| `:434-441` | warn/debug  | `Repair parse failed — trying tolerant extraction` + repair raw output                                                             |
| `:452`     | debug       | `parsed via tolerant extraction` + which source                                                                                    |
| `:459-470` | error/debug | `All parse attempts failed` (→ `AI_001`) with both raw outputs                                                                     |

API (all three require `ADMIN_PERMISSION`, `highRisk` — `generation.controller.ts:328-329,343-344,350-351`):

- `GET /api/v1/projects/:id/runs` — run list (not admin-gated, `:321`).
- `GET /api/v1/projects/:id/runs/:runId` — status, outcome, `input`, `nodeTrace`, `modelCalls[]`, `toolCalls[]`,
  `contextPack` (`generation.dto.ts:731-777`).
- `GET /api/v1/projects/:id/runs/:runId/context` — the assembled pack plus `rendered`, the exact text supplied
  (`generation.dto.ts:716-720`).
- `GET /api/v1/projects/:id/runs/:runId/calls/:callId` — adds **`rawOutput`** and `error` (`generation.dto.ts:722-729`).
- `GET /api/v1/projects/:id/ai-usage` and `GET /api/v1/projects/:id/cost`.

DB, when you are not an admin:

- `model_calls` (`src/database/schemas/ai.ts:77-110`) — `run_id, node, role, provider, model, prompt_key,
prompt_version, status, input_tokens, cached_input_tokens, output_tokens, latency_ms, cost_usd, attempt,
raw_output, error`. `raw_output` is persisted for every successful call
  (`src/modules/ai/telemetry.handler.ts:152-182`), so this is the honest record of what the model wrote.
- `context_packs` (`ai.ts:129-148`) — `purpose, budget_tokens, used_tokens, sections, unresolved_refs, omitted, rendered`.

**Caveat that trips people up:** the bible-builder graph never calls the context assembler — it passes prior stage
documents as plain prompt variables (`src/modules/ai/graphs/bible-builder.graph.ts:183-245`). So **a bible run has
no `context_packs` row** and `GET /runs/:runId/context` is empty for it. That is expected, not a bug.

LangSmith: **`AI_LANGSMITH_API_KEY` does not work.** `bootstrap.ts:56` loads `ai.langsmith.api.key` into the
config cache, and nothing in `apps/` or `packages/` ever reads it back; LangChain reads its own unprefixed
`LANGSMITH_TRACING` / `LANGSMITH_API_KEY` from the process env. To get traces, export those two directly
alongside the server. Leave `AI_LANGSMITH_API_KEY` alone and do not conclude tracing is broken when it produces
nothing.

---

### 8. Resetting state between runs

This is the part the README does not cover and where the obvious move is wrong.

| What you want                                   | How                                                                                                         | Evidence                                                                  |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Throw away everything for one project           | `DELETE /api/v1/projects/:id` (204) — cascades to every child table                                         | `project.controller.ts:68-72`, `project.service.ts:342-346`               |
| Re-run the bible builder over an existing bible | `POST /api/v1/projects/:id/seed-from-brief` with `{"brief":"…","force":true}`                               | `generation.dto.ts:105-112`; skip-check at `bible-builder.graph.ts:73-81` |
| Clear drafts/briefs only                        | `POST /api/v1/projects/:id/reset {"stage":"generate"}`                                                      | `project.service.ts:376-385`                                              |
| Clear volumes                                   | `…/reset {"stage":"plan"}`                                                                                  | `project.service.ts:369-374`                                              |
| Clear entities/world facts                      | `…/reset {"stage":"extract"}`                                                                               | `project.service.ts:352-367`                                              |
| Wipe the DB                                     | `DROP DATABASE novel_forge; CREATE DATABASE novel_forge;` then `bun run db apps/novel-forge-server migrate` | no endpoint or script exists                                              |

**Two traps:**

1. `POST /:id/reset` with `stage: "all"` **does not delete `bible_documents` or `canon_facts`.** Read
   `project.service.ts:348-388` — `bibleDocuments` and `canonFacts` appear nowhere in it. So after a "reset all"
   the bible prose survives, and a `seed-from-brief` **without** `force:true` skips every stage
   (`bible-builder.graph.ts:73-81`) and returns `completed` having made zero model calls. If you are comparing
   bible outputs, the only clean baselines are **a fresh project** or **`force: true`**.
2. The UI cannot re-run the builder at all. The "Generate story bible" button lives inside the screen's
   `EmptyState` (`story-bible.tsx:640-660`) — once any entity exists the empty state is gone — and `runSeed` never
   sends `force` (`story-bible.tsx:546`). **Every re-run is an API call.**

Cost note: one full bible build = **7 model calls** minimum (one per manifest stage,
`bible-builder.graph.ts:263-281`), plus one extra per stage that fails schema validation and enters the repair
rung (`model-router.service.ts:416-424`).

---

### 9. `PLUGINS_DIR`

Leave it unset or empty. `PluginHost.onModuleInit` returns immediately on an empty dir
(`src/modules/plugins/plugin-host.service.ts:33-39`). Otherwise each direct child directory must be named for its
plugin id, carry a `manifest.json` and an `index.js`/`index.ts` (`src/modules/plugins/plugin-loader.ts:19,26-27,213-241`);
a missing dir or a broken plugin is a warn, not a failure (`:215-224,236-239`). The REST surface
(`/api/v1/plugins`, `/api/v1/projects/:id/plugins/*`) registers regardless. Plugins stamp
`model_calls.plugins` / `policy_digest` (`ai.ts:100-102`), so an empty dir keeps those columns null and your
model-call rows comparable.

---

### 10. Minimal host setup, end to end

```bash
# 1. Postgres with pgvector reachable (cluster: gitops up dev → 127.0.0.1:7070)

# 2. apps/novel-forge-server/.env
cp apps/novel-forge-server/.env.example apps/novel-forge-server/.env
```

The example already ships `NODE_ENV=development`, `APP_STAGE=dev`, `LOG_LEVEL=debug`, `AI_OLLAMA_HOST`,
`AI_EMBEDDING_MODEL` and `DATABASE_POSTGRES_URL=postgresql://postgres:postgres@localhost:7070/novel_forge` — the
cluster's Postgres port. Leave those alone unless your Postgres is elsewhere. What you must change:

```
AI_OPENROUTER_API_KEY=<key>            # nothing AI works without it
AUTH_ISSUER=<reachable identity>       # the example points at prod identity
AUTH_CLIENT_SECRET=<secret>            # blank breaks the boot, it does not disable login
AUTH_SESSION_COOKIE_SECURE=false       # plain http — must be set with the next line
AUTH_SESSION_COOKIE_NAME=shadow-session
AI_QUOTA_MAX_CALLS=0                   # commented out in the example; 0 disables the guard
AI_QUOTA_MAX_COST_USD=0
STORAGE_DRIVER=local                   # the example ships s3 (Garage)
PUBLISHING_AUTO_PUSH=false             # no reader service on the host
# AUTH_APP_ID stays novel-forge; PLUGINS_DIR stays unset
```

```bash
# 3. migrate (from the repo root — the workspace has no db script of its own)
bun run db apps/novel-forge-server migrate

# 4. optional but recommended — without it retrieval degrades silently (§6)
ollama pull qwen3-embedding:8b   # then keep ollama running on :11434

# 5. run — two terminals, each starting from the repo root (the cds are not chainable)
(cd apps/novel-forge-server && bun run dev)    # terminal 1 — :8080
(cd apps/novel-forge-web    && bun run dev)    # terminal 2 — :3000, API_ORIGIN unset

# 6. authenticate (§3) — browser login needs a localhost redirect URI registered at your identity;
#    against the k3d cluster's identity there is none, so use a bearer token instead
# 7. create a project (kind new_novel) and PATCH its brief
```

---

### 11. Existing automated tests and eval scripts — what they do and do not prove

#### Commands

From `apps/novel-forge-server` (`package.json:7-16`) — these are the one exception to "every command runs from the
repo root", because they are the workspace's own scripts and Bun resolves `tests/` relative to the cwd:

```bash
bun run test            # bun test --coverage --timeout 20000 — the whole suite
bun test tests/ai       # AI tests only
bun test tests/eval     # eval tests only (no DB needed)
bun run test:ai:unit    # prompts.spec + model-router.spec + context-assembler.spec
bun run test:ai:graph   # tests/ai/workflow.spec.ts only
bun run test:ai:tools   # tests/ai/tool-registry.spec.ts only
bun run ai:smoke        # prints a cost estimate and exits 0 unless AI_SMOKE_SPEND is set
bun run eval:metrics    -- --project <id> [--from n --to n | --all] [--source final|draft] [--json]
bun run eval:invariants -- --project <id> [--from --to] [--since <ISO>] [--json]
```

Setup, all three from the repo root: `bun install`, build the workspace packages (`bun scripts/build.ts
'packages/*'` — the glob form is supported, `scripts/build.ts:40,43`), then
`bun run db apps/novel-forge-server create-template`.

**Silent-skip hazard.** 109 spec files gate on `describe.if(pgAvailable)` and 33 boot a `TestEnvironment`
(`tests/test-environment.ts`) on a per-suite DB cloned from the template
(`tests/fixtures/template-db.ts:14-21`). With Postgres unreachable **they skip, and a skip looks like a pass** —
check the skip count in the summary. Template name: `scripts/db.ts:78` derives `<dbname>_template` from the URL,
while `tests/fixtures/template-db.ts:12` hardcodes `novel_forge_template`; they agree only when the URL's database
is named `novel_forge`, or you export `POSTGRES_TEMPLATE_DB_NAME`.

#### `tests/ai/prompts.spec.ts` (1,307 lines) — makes no model calls

It asserts prompt **wiring**: the `AUTHORING_STYLE` / `AUTHORING_STYLE_PLANNING` split by prompt `kind` (`:49-77`),
hard-pinned versions for specific keys (generation 2.5.0 at `:1008`, outline 2.3.0 at `:1063`, judge 2.3.0 at
`:1090`, bible-audit 2.0.0 at `:190-204`, and others), template-variable rendering and message order for the
cache-strategy prompts, and `parseSchema` acceptance/rejection of hand-written payloads. It also pins prompt copy
as string-contains — the generation prompt must state a floor, aim and ceiling built from `WORD_TARGET_MIN` /
`WORD_TARGET_AIM` / `WORD_TARGET_MAX` (`:945-950`), which it imports from the eval bands at `:43`, so the prompt
text and the metric band cannot drift apart.

There is **no registry-completeness test**: the only registry-wide loops filter by `kind`. Most bible-builder stage
versions are **not** pinned anywhere; `tests/ai/bible-stage-contract.spec.ts:64-69` only checks the seven keys exist.
Coverage ignores `src/modules/ai/prompts/**` and `src/modules/ai/schemas/**` and `coverageThreshold = 0`
(`bunfig.toml`).

**Proves:** the prompt text, versions, template variables and schemas are internally consistent.
**Does not prove:** that any model obeys any of it.

#### `tests/eval/*` — pure functions over synthetic data, no model, no thresholds

- **`bible-readiness.spec.ts`** exercises `scoreBibleReadiness` (`src/modules/eval/bible-readiness.ts:137-142`) on
  hand-built rows. Five dimensions — `coverage`, `records`, `substance`, `integrity`, `reveal` (`:10`); only
  `coverage` and `records` block drafting (`:58,140-141`). `DOC_WORD_FLOOR = 250` (`:54`) and a
  `tbd|todo|fixme|[placeholder]|lorem ipsum` regex (`:56`) are the entire "substance" test.
  **A 250-word run of the word "word" passes `substance`** — the spec's own fixture at `:13` is exactly that.
  This is the same function behind `GET /api/v1/projects/:id/bible/readiness`
  (`src/modules/bible/readiness/bible-readiness.service.ts:31`); no spec covers that controller or service.
- **`deterministic-metrics`** (`src/modules/eval/deterministic-metrics.ts`) — word band 1,800–2,600 (aim 2,200),
  sentence band 6–22 words plus the longest out-of-band run, repeated 5–8-gram rate within and across chapters,
  ~21 stock-phrase regexes, said/asked vs 23 alternative dialogue verbs, contraction rate inside quotes only, and
  the ending-mode distribution from `briefs.endingContract`. The CLI reads a **real** project's chapters or drafts
  from Postgres, prints a report, and **always exits 0 — it has no pass/fail thresholds**.
- **`process-invariants`** (`src/modules/eval/process-invariants.ts`) — the fail-open invariant (a draft whose
  `judge === 'evaluation_failed'` reached approved/final with no human-approval row), the `evaluation_failed` rate,
  repair attempts per run from `model_calls.node ∈ {repairPatch, repairRewrite}`, batch halts, and validation
  window coverage. Also prints and exits 0; its own text says "Fail-open … must be 0" but nothing enforces it.

#### `tests/ai/ai-smoke.ts` — the only live-model tool

Gated on `AI_SMOKE_SPEND` (`:17,33-42`): a bare `bun run ai:smoke` prints the model list and estimated cost and
exits 0 without spending. With the var set it exits 1 if `ai.openrouter.api.key` is missing (`:44-47`).

It builds a real `ModelRouterService` with stub telemetry/DB/quota (`:56-65`) and makes **7 live calls** —
`ROLES` at `:18` is `['bible','title','judge','generation','translate','translate','audit']`, so on the production
defaults that is glm-5.2, gpt-5.6-luna, claude-sonnet-5, kimi-k3, kimi-k3 ×2, claude-sonnet-5. Estimated at 1,500
in / 700 out per call (`:21-31`), roughly **$0.07** total. Assertions are shape-only: the foundation rung checks
`typeof result.body === 'string' && result.body.length > 10` (`:84`); the judge rung feeds an obvious canon
contradiction but accepts **either** verdict (`:108`).

**Proves:** the models are reachable and return schema-conformant structured output through the repair ladder.
**Does not prove:** that any answer is correct or good.

#### `tests/ai/bible-builder-graph.spec.ts` (368 lines)

Real graph, real Postgres, real checkpointer — but the model is stubbed inline as
`structured: async () => stageOutput` (`:30-33`), so **every stage returns the same canned object**. It proves
persistence (entity `body` cards, canon-fact `terms`/`revealChapter`, world facts), `COALESCE` semantics on a
forced rebuild, the non-forced skip, transactional atomicity (an invalid entity type rolls the whole stage back,
`:309-326`), and that every manifest chapter is indexed as `bible_doc:<section>/<slug>` (`:352-353`).
It **cannot** prove a real model meets the entity floors, because `structured` — and therefore the repair
ladder — is bypassed.

#### Other AI specs worth knowing

- `tests/ai/repair-ladder.spec.ts` — the chapter-generation judge/patch loop (3 judge calls, `attempt === 2`,
  `outcome === 'accepted_with_findings'`, an exact `nodeTrace`), **not** the router's JSON repair.
- `tests/ai/judge-fail-closed.spec.ts` — two unparseable judge replies must land `evaluation_failed` +
  `reviewStatus: 'contradiction'`, never `consistent`.
- `tests/ai/schema-shaping.spec.ts` — `toHostedPromptSchema` keeps descriptions and `minItems`/`minLength` and
  strips `$id`/`definitions`/`$ref`/`default`; also asserts the schema really is placed in a message in front of
  the model.
- `tests/ai/json-extract.spec.ts` — brace/quote/fence tolerance of `extractJsonCandidates`.
- `tests/ai/model-router.spec.ts` (709 lines) — role resolution, allowlist coercion, reasoning policy, the
  ladder's call counts, image/vision guards. No real model, no DB.
- `tests/bible/bible-manifest.spec.ts` — one chapter per stage, unique `section/slug`, `minEntities > 0` iff the
  chapter materializes types, every chapter has at least one required topic.

#### Honest summary for a tester

**Proven without a model:** prompt/schema wiring and version pins; JSON extraction and the repair ladder;
fail-closed judge routing; bible-builder persistence and atomicity; manifest floors and readiness arithmetic;
the prose-metric and process-invariant maths.

**Proven for ~$0.07** (`AI_SMOKE_SPEND=1 bun run ai:smoke`): the seven production models are reachable and return
schema-conformant output.

**Proven by nothing in the repo:** bible content quality; that a real model clears the entity floors; that real
chapters land in the length band or avoid stock phrases; judge accuracy (false positives or negatives); anything
cross-model, because **there is no fixed corpus, no golden output and no LLM-as-judge anywhere** — `grep` for
`toMatchSnapshot` in `tests/` returns nothing, and the only prose fixture is
`tests/fixtures/draft-body.ts`, a single sentence repeated 210 times to clear a word-count minimum.

Closing that gap needs a blind evaluation of real output against a baseline.

---

### Where the old README is wrong

| README said                                                    | Actually                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `STORAGE_DRIVER` default `local`, `STORAGE_IMAGE_DIR=./images` | the driver is `s3` (Garage) in `.env.example:46`, and the key is `STORAGE_LOCAL_DIR` (`:58`); `STORAGE_IMAGE_DIR` no longer exists                                                                                                                                                         |
| the env table is the whole list                                | it omits `AI_LLM_TIMEOUT_MS`, `AI_LLM_MAX_RETRIES`, `AI_LLM_BACKOFF_MS`, `AI_QUOTA_*`, `PROJECTS_MAX_PER_OWNER`, `PUBLISHING_AUTO_PUSH`, `GENERATION_RECONCILIATION_CADENCE`, `PLUGINS_DIR` (all in `bootstrap.ts:50-64`), and every `AUTH_*` var — without which the server does not boot |
| "five LangGraph workflows"                                     | there are now ten graphs in `src/modules/ai/graphs/` — the five listed plus chapter-rebrand, chapter-reforge, chapter-translation, span-transform and mechanical-check                                                                                                                     |
| route table                                                    | routes have moved: the bible document route is `GET/PUT /projects/:id/bible/:section/:slug` (`bible-document.controller.ts:23,32`), volumes approve is `POST /projects/:id/volumes/approve` (`volume.controller.ts:17`), and many screens' routes did not exist then                       |
| `.env.example:13` "Run `bun run db:migrate`"                   | there is no `db:migrate` script in `apps/novel-forge-server/package.json`; use `bun run db apps/novel-forge-server migrate` from the root                                                                                                                                                  |

---

## Part 2: Idea to lore bible

Covers: Ideation Studio (seed, studio turns, concept cards, stress pass, constraint playbooks, graduation), premise
enhancement, bible builder, bible readiness, bible audit, and proposal-only writes into bible documents / entities /
canon facts. The refinement **chat hub** (`/novels/$novelId/chat`, `scopeType != 'ideation'`) is covered in
Part 5 (chat hub and admin) — cross-referenced here where it is the only editor for something.

Everything below is read off current code in `apps/novel-forge-server` / `apps/novel-forge-web`.

### Shared setup

- All API paths are relative to the server host; every route below is `@Authenticated()` and needs
  `novel-forge:projects:read`, plus `novel-forge:projects:write` + `novel-forge:generation:run` on anything that
  spends a model call.
- `projectId` is a numeric string. `:projectId` on studio routes must be a project with `projects.status = 'seed'`
  (`loadNamedSeed`, else `IDE_001`); graduation is the last call that requires `seed`, and everything after it
  requires `status = 'active'` and a `kind` other than `translation`/`curated` (`assertAuthoringProject`).
- Observability for every recipe (one place): **Workflow Runs** screen (`/novels/$novelId/runs`, needs the
  `novel-forge:admin` scope) or `GET /api/v1/projects/{projectId}/runs` (not admin-gated), `GET …/runs/{runId}`,
  `GET …/runs/{runId}/context` (the context pack), `GET …/runs/{runId}/calls/{callId}` (raw output) — the last
  three require `novel-forge:admin`, see Part 1 (setup) §7.
  DB: `workflow_runs(graph, target, status, outcome, node_trace, context_pack_id)`,
  `model_calls(prompt_key, prompt_version, role, provider, model, status, attempt, input_tokens, output_tokens, cost_usd, raw_output)`,
  `context_packs(purpose, budget_tokens, used_tokens, sections, rendered)`.
  A `model_calls.status` of `repaired` (or two rows with `attempt` 0 and 1) means the model failed schema/postValidate
  on the first pass — the single best signal that a prompt is weak for this idea.

### The sample idea (original; reuse verbatim for comparisons)

> **Spark.** Tin Vashka mends civic bells in a river city where each bell holds one public memory — a flood line, a
> debt, a verdict. Repairing a bell nobody remembers casting, she finds she can hear the crimes the city forgot, and
> every crime she rings back into public memory rewrites who owes what to whom. The magistrates want her hands. The
> debtors want her voice. Each bell she sounds makes her better at hearing and worse at forgetting.

Working title for graduation: **The Bell Debt**.

---

#### Ideation Studio — create a seed (spark → opening turn)

- **Entry:** **Ideas** shelf (`/ideas`) → **New idea**; `POST /api/v1/seeds`. Creates the project itself (`kind: new_novel`, `status: seed`).
- **Preconditions:** none. This is the first recipe; everything else in this file builds on its `projectId`.
- **Input:** `{"spark": "<the sample spark above>"}` (optional `"contentMode": "standard" | "unrestricted"`).
- **Run:** 1. POST the body (responds `201`). 2. Note `projectId` and `sessionId` from the response. 3. Poll
  `GET /api/v1/projects/{projectId}/chat/sessions/{sessionId}/messages` until `pendingTurn` is **null** (it is an
  object while a turn runs, not a boolean; the opening turn is fired detached, after the create commits). 4. Reload
  `/ideas` and open the card.
- **Verify:** `story_seeds` has exactly one row for the project (`story_seeds_project_id_unique`), all jsonb columns at
  their empty defaults, `content_hash` set. `chat_sessions` has one row `scope_type='ideation'`, `mode='auto'`,
  `title='Ideation Studio'`; `chat_messages` ordinal 1 is the spark **verbatim** (role `user`). Two background runs
  appear: `graph='ideation-turn'` (prompt `ideation-turn@1.3.0`, role `chat`) and `graph='ideation-name'`
  (prompt `idea-name@1.0.0`, role `title`, _excluded_ from `GET …/runs` and the runs rail by design — it is off the
  `AUTHOR_FACING_GRAPHS` allowlist, so read it straight from `workflow_runs`). `projects.title` flips from null to a
  short name; the shelf card shows a “Naming this idea…” skeleton until it lands and then that name, with the spark
  excerpt beneath it (“Untitled idea” is the fallback only for a seed created with no spark).
  **Quality:** the assistant reply is a lead-in only — it must _not_ restate the questions (those live in
  `payload.questions[].wording`), and it should read back decisions _already inside the spark_ (bells, debt, a
  hearing/forgetting trade) rather than generic craft advice.
- **Fails when:** spark echoed twice in the transcript (the adopt-unanswered-message path in
  `persistUserMessage` broke); `projects.title` stays null (naming run failed — it is fire-and-forget and only logs);
  seed row missing but a `seed`-status project exists (compensating delete in `createSeed` failed);
  `IDE_006` on the first manual turn (opening turn still in flight).
- **Cost:** 2 model calls (turn + naming).

#### Ideation Studio — one interview turn

- **Entry:** Idea studio composer at `/ideas/$seedId` — the route param is the **projectId**, not `story_seeds.id`;
  `POST /api/v1/projects/{projectId}/chat/sessions/{sessionId}/messages`.
- **Preconditions:** seed created; no turn in flight (`GET …/chat/sessions/{sessionId}/turn`).
- **Input:** answer the open round in your own words, 1–200,000 characters, e.g.
  `{"content": "Shelf: low-fantasy city fantasy, heist-adjacent. Room: the Bellhouse and the flooded lower wards of Ghelvarn. Length: open-ended, two chapters a week."}`
- **Run:** 1. Read the last assistant message's `payload` (`kind: "questions"`). 2. Answer with the composer (or tap
  option chips and press **Put N verdicts in the reply** on a card round). 3. POST. 4. Re-read the seed:
  `GET /api/v1/projects/{projectId}/seed`.
- **Verify:** run `graph='ideation-turn'`, `target='session:{id}'`, prompt `ideation-turn@1.3.0`, one linked
  `context_packs` row with `purpose='ideation'` whose sections include `seed_sheet`, `round_questions` (required, never
  truncated) and — once locks exist — `locked_constraints`, `taste_anchors`, `shape_playbooks`.
  `story_seeds.asked_questions` grows with **every offered** id, answered or not. A `refinement_proposals` row
  (`kind='ideation'`, `scope_type='ideation'`; the studio's op allowlist is `seed.update` plus `action.graduate_seed`,
  and an interview turn should only ever stage `seed.update`) is created _and auto-applied_ (session is
  `auto`), so `story_seeds.fields` / `.constraints` / `.taste_anchors` move in the same request and
  `story_seeds.revision` bumps. Room answers must land as `constraints[].kind='scope'` whose lowercased key, split on
  non-alphanumerics, contains one of the tokens room/setting/world/place/location/locale (the bank's emission contract
  says `setting`) — any other key or kind is invisible to the router and the question re-asks.
  **Quality:** ≤3 questions, each with ≥2 _concrete_ tappable options built from this seed (never “something else”),
  `coaching` copied character-for-character from the bank, and a `youDecide` line that commits to one answer with a
  reason. Options for a `select: "many"` question must each stand alone (no “either X or Y”).
- **Fails when:** the same question id is offered a third time (`circlingIds` should force a commit at
  `CIRCLING_LIMIT = 3`); `IDE_006` (turn already running); `IDE_003` (model returned a question id not in the bank);
  proposal left `pending` with an `applyNote` — a baseline conflict downgraded the auto-apply.
- **Cost:** 1 model call per turn; the full interview is ~6–10 turns.

#### Ideation Studio — concept-card round (diverge)

- **Entry:** same composer; the router fires this when `diverge.cards` is offered (no `premise` on the sheet yet).
- **Preconditions:** `story_seeds.fields.premise` empty. Start the sample idea **without** a premise if you want this
  round: with a premise on the sheet the diverge stage is skipped entirely.
- **Input:** `{"content": "Re-roll these. No amnesia openings, and keep the bells physical — I want metal, not metaphor."}`
- **Run:** 1. Reach the round. 2. Judge cards in the UI (keep / kill / crossed + a reason) and send. 3. Re-read the seed.
- **Verify:** run `graph='ideation-concepts'`, prompt `ideation-concepts@1.0.0`, role `chat`. Assistant message
  `payload.kind='cards'` with `round` and exactly **4** cards; each card has a server-minted uuid `id` and
  `fate='offered'`. `story_seeds.concepts` is appended (never replaced) and `round` increments per generation.
  The assistant `content` is the bank's `diverge.cards` coaching line verbatim.
  **Quality:** the four cards should differ on **engine**, **ladder** _and_ **posture** — four dressings of one idea is
  the headline failure. Each `logline` names who / what pressure / what is lost; each `hookLine` would make a browsing
  reader open chapter one.
- **Fails when:** `payload.filtersFailed` present — a locked playbook's `conceptFilter` rejected cards twice and they
  are shown anyway (by design: author judgement outranks the filter). Check the log line
  `studio concepts: filters still rejecting`. Fewer or more than 4 cards means schema `minItems/maxItems` was bypassed.
  A verdict landing on the wrong card means the model dropped/reordered ids instead of echoing them.
- **Cost:** 1 model call, 2 if the playbook filter rejects the first set.

#### Ideation Studio — constraint playbooks (forced questions)

- **Entry:** no endpoint of its own — it is the lock-matching layer under every turn (`matchPlaybooks`).
- **Preconditions:** a seed with at least one locked constraint.
- **Input:** lock an open-ended run and a single viewpoint, e.g.
  `{"content": "Open-ended, I'll run it for years. One POV only — Tin's. And no harem, ever."}`
- **Run:** 1. Send. 2. Read `GET …/seed` → `constraints[]` and note which of the three locks landed as constraints
  rather than sheet fields. 3. Open the turn's context pack (`GET …/runs/{runId}/context`) and read its
  `shape_playbooks` section. 4. Take the next two turns and watch which questions arrive.
- **Verify:** matching is **lexical and computed at read time** — no code writes `constraints[].playbookKey`, so it is
  normally absent and its absence proves nothing. The observable is the `shape_playbooks` context-pack section, which
  names every matched playbook key (library keys: `dual-leads`, `regression`,
  `no-harem`, `litrpg-system`, `open-ended-length`, `ensemble`, `slow-burn`, `single-pov`). Each one forces its
  question: `open-ended-length` → `deepen.renewal`; `single-pov` → `deepen.ironyBudget`; `no-harem` →
  `deepen.stayingCost`; `litrpg-system` → `deepen.systemRules`; `ensemble` → `deepen.povBudget`; `dual-leads` →
  `deepen.secondLadder`; `regression` → `deepen.foreknowledgeDecay` + `deepen.divergence`; `slow-burn` →
  `deepen.deferredTension`. A forced question is gated on `asked_questions` alone, so it must appear **exactly once**.
  A matched playbook's needles are matched against the constraint's `text` plus its `key`/`kind` — so a lock recorded
  only as a **sheet field** never matches (`orient.length` fills `serializationNotes`, and its open-ended follow-up
  forces `deepen.renewal` through `followUps`, not through a playbook match).
  **Quality:** the forced question's wording should reference the lock (“your ladder tops out…”), not ask generically.
- **Fails when:** a forced question re-offers forever (`recordOffered` not persisted — check `asked_questions` after
  the turn); a locked constraint is absent from `shape_playbooks` although its text plainly matches (lexical matcher
  miss — the server logs `locked constraint has no playbook` for every unmatched lock).

#### Ideation Studio — stress pass (readiness)

- **Entry:** **Run stress check** in the _Story seed_ side panel; `POST /api/v1/projects/{projectId}/seed/stress`.
  Also fires automatically as a turn once the sheet is stress-ready.
- **Preconditions:** for the _automatic_ pass, all of `genre, premise, hook, castShape, progressionSystem,
protagonistDrive, stakes, voice` filled. The on-demand endpoint runs on any sheet.
- **Input:** none (empty POST).
- **Run:** 1. POST. 2. Read `readiness[]` in the response and in the side panel. 3. Press it a second time with the
  sheet unchanged.
- **Verify:** run `graph='ideation-stress'`, `target='seed:{seedId}'` (on-demand) or `session:{id}` (turn), prompt
  `ideation-stress@1.0.0`, role `judge`. `story_seeds.readiness` is replaced with **exactly 7 entries in this order**:
  `hook, protagonist, engine, ladder, promise, voice, room`. Every `thin`/`empty` verdict carries a `fix`. The count
  comes from the schema's `minItems`/`maxItems`; the order, the fix rule and the “a structurally empty dimension may
  never be called strong” rule come from the prompt's `postValidate`, so a first reply that breaks one is repaired
  rather than rejected. The on-demand endpoint writes **no** chat messages; the router-triggered turn writes two.
  The second press on an unchanged sheet should be served from `llm_cache` (role `judge` is cacheable, and `readiness`
  is not part of the pack the key hashes) — a second `ideation-stress` run row still appears, but with **no** new
  `model_calls` row behind it; the server logs `LLM cache hit — skipping model call`.
  **Quality:** each `note` should quote the sheet (“‘better at hearing, worse at forgetting’”), not describe it in the
  abstract; a `fix` must be one takeable step, not “develop this further”.
- **Fails when:** fewer than 7 entries, or an order/`fix`/`strong`-on-empty violation that survived the repair pass
  (a repaired first attempt shows as `model_calls.status='repaired'`, not as a failure); `promise` reported strong
  with no `constraints[].kind='promise'` on the sheet — the readiness dimension reads the _kind_, so a promise filed
  under any other kind never counts.
- **Cost:** 1 model call, 0 on a cache hit.

#### Ideation Studio — graduation (deterministic, zero AI)

- **Entry:** **Start the novel** (side-panel footer or the graduate dialog);
  `POST /api/v1/projects/{projectId}/seed/graduate`.
- **Preconditions:** `status='seed'`, `story_seeds.fields.premise` non-empty, no turn in flight. Readiness advises and
  never blocks.
- **Input:** `{"title": "The Bell Debt"}`
- **Run:** 1. POST. 2. Read the response `documents`, `factKeys`, `provenance`. 3. Open
  `GET /api/v1/projects/{projectId}/bible` and the two documents.
- **Verify:** **no** `workflow_runs` row and **no** `model_calls` row — graduation is pure rendering. One transaction:
  `projects.status='active'`, `name`/`title` = the title, `premise` = the sheet premise, `themes` = sheet themes,
  `instructions` appended with `Narration voice, decided in the Ideation Studio: …`.
  `bible_documents` gains exactly `project/premise` and `project/reader-promise`. One `canon_facts` row per **distinct
  promise-constraint key**, `fact_key` = `promise:<slugified key>`, `source='seed'`, `reveal_chapter` NULL,
  `constraint_note` prefixed `Reader promise locked at ideation — …`. The bank tells the model to file every promise
  under the key `promise`, so several promise constraints collapse into a single `promise:promise` row and only the
  last one survives — count `factKeys` against the promise constraints on the sheet and expect the shortfall (see
  Finding 8). `story_seeds` row **deleted**; every `ideation` chat session set to `archived`. No volumes, no
  entities — by design.
  **Quality:** `project/premise` must carry no chapter structure or volume detail (sheet is idea-altitude only);
  `project/reader-promise` must list the promises as falsifiable rules, plus locked shape/scope rules, serialization,
  voice, taste anchors. Read `provenance`: `author` vs `studio` vs `crossed` counts are the honesty check, and this
  response is the **only** place they can ever be read (the seed is gone).
- **Fails when:** `IDE_008` (no premise), `IDE_002` (blank title), `IDE_001` (already graduated / not a seed),
  `IDE_006` (turn in flight). The sibling failure is `IDE_007`, raised only by a **blanket manual apply** of a
  proposal containing `action.graduate_seed`; an auto-mode studio turn does not fail on that op — it declines it and
  reports the reason in `applyNote`, leaving the proposal `pending`.

#### Premise enhancement (refine)

- **Entry:** `POST /api/v1/projects/{projectId}/premise/enhance` — **API only. UNREACHABLE from the web UI**: no
  component calls it (`apps/novel-forge-web/src/lib/apis/` has no `useEnhancePremise*` hook; the type exists only in
  `api-types.gen.ts:1618`). The `action.enhance_premise` op can reach it from the refinement chat hub
  (see Part 5).
- **Preconditions:** `status='active'`. Falls back to `projects.brief` then `projects.premise` when `overview` is
  omitted; when supplied, `overview` must be 10–200,000 characters.
- **Input:** `{"overview": "<the sample spark above>"}`
- **Run:** 1. POST. 2. Read the `rationale` fields. 3. Open **Proposals** (`/novels/$novelId/proposals`), review, apply.
- **Verify:** run `graph='premise-enhance'`, `target='premise'`, prompt `premise-enhance@1.1.0`, role `premise`;
  context pack `purpose='premise'` (project premise + a 1-line-per-doc inventory). The response's `rationale` object
  carries `enhancedPremise, hook, stakes, protagonistDrive, progressionSystem, serializationNotes, genre, themes`, and
  `proposal` is the staged change-set (`kind='premise_enhance'`, `scope_type='novel'`, allowed ops `premise.update`,
  `bible_document.upsert` only). Nothing is written until
  `POST /api/v1/projects/{projectId}/proposals/{proposalId}/apply`.
  **Quality:** the enhanced premise reads as back-cover copy in 2–3 paragraphs — it must **not** walk the arc and must
  **never** state the ending. Serialization machinery belongs in `serializationNotes`, not in the premise prose.
- **Fails when:** `PRM_001` (no overview and no brief/premise on the project); `IDE_004` (project still a seed);
  `model_calls.status='repaired'` with a `changeSet` postValidate failure (ops outside the two allowed types).
- **Cost:** 1 model call.

#### Bible builder (staged AI seed of the bible)

- **Entry:** **Story Bible** screen → **Generate story bible** (shown **only in the empty state**, i.e. when the project
  has zero entities); `POST /api/v1/projects/{projectId}/seed-from-brief`.
- **Preconditions:** `status='active'` and a `kind` other than `translation`/`curated`. The API reads the brief from
  the **body only** and never touches `projects.brief`; the web button is what requires a non-empty `projects.brief`,
  and a graduated project has none — set it in **Project Settings → “Premise / brief”** first (see Findings).
- **Input:** `{"brief": "<the sample spark, plus: open-ended serial, single POV (Tin), low-fantasy river city>", "force": false}`
  (`brief` is required and unbounded; `force` is optional and defaults to false.)
- **Run:** 1. POST (the request blocks for the whole run — minutes). 2. Watch `GET …/runs` for
  `graph='bible-builder'`, `target='all-stages'`. 3. Read `GET …/bible` and `GET …/entities`.
- **Verify:** `node_trace` = `foundation, world, power, factionsAndLocations, characters, plot, volumes, indexLore`.
  Seven prompts, one per stage: `bible:foundation@2.0.0`, `bible:world@1.0.0`, `bible:power@1.0.0`,
  `bible:factions-locations@2.0.0`, `bible:characters@2.0.0`, `bible:plot@2.0.0`, `bible:volumes@2.0.0`. Each stage
  writes `model_calls.role` = its **prompt key** (`bible:foundation`, `bible:world`, …), not `bible` — filter on
  `prompt_key`, not on `role`. `bible_documents` gains the manifest addresses: `project/premise`, `world/setting-overview`,
  `power/system-and-limits`, `world/factions-and-locations`, `project/cast`, `plot/escalation-map`,
  `story_state/volume-plan`. Coverage floors are enforced in the repair ladder (`validateStageCoverage`):
  `world` ≥3 `location|concept`, `power` ≥4 `power_rule|concept`, `factionsAndLocations` ≥4 `faction|location`,
  `characters` ≥3 `character` — as **`entities` rows** (`origin='generated'`, `status='active'`), not prose.
  `canon_facts` (`source='generated'`) and `world_facts` may also appear. `lore_chunks` gains `kind='bible_doc'` rows.
  A stage whose document already has a body is **skipped** unless `force: true` (`counts[stage] = 0`, still in `stagesDone`).
  **Quality:** every character entity's `body` must carry a want, a wound/cost and a voice tic concrete enough to write
  dialogue from; `power/system-and-limits` must state what the power _cannot_ do and what breaking a rule costs;
  `project/cast` must name a protagonist, an antagonist and the relationships that generate conflict — a cast document
  with no antagonist is the classic weak output here.
- **Fails when:** repeated `model_calls` rows with `attempt=1` on one stage — the coverage floor was missed and the
  reply was retried; a stage silently skipped because graduation already wrote its document (`project/premise`);
  `PRJ_001`/`IDE_004`; an HTTP timeout at the gateway while the run keeps going server-side (check `workflow_runs`, not
  the response).
- **Cost:** 7 model calls (fewer if stages skip) + embeddings for `indexLore`; minutes of wall clock.

#### Bible readiness (deterministic score)

- **Entry:** Story Bible screen banner (`BibleReadiness`); `GET /api/v1/projects/{projectId}/bible/readiness`.
- **Preconditions:** any active project; meaningful after the builder ran.
- **Input:** none.
- **Run:** GET, before and after each bible-writing step.
- **Verify:** five dimensions in order — `coverage` (each of the 7 manifest **roles** is covered: by its canonical
  address, by any non-empty document in the role's sections whose slug or title carries one of the role's keywords
  (`BibleChapterSpec.role`), or — for three roles — by records: factions/locations by ≥4 `faction|location` rows with at
  least one faction, the cast by ≥3 `character` rows not all `minor`, the volume plan by any `volumes` row with an
  objective), `records` (each of the 4 entity-bearing chapters' `minEntities` met by entity **rows**, counted project-wide by
  type — a `concept` row therefore counts toward both `world` and `power`), `substance` (each role's documents
  together ≥ **250 words** — 100 for the premise — and every written doc free of
  `tbd|todo|fixme|[placeholder]|lorem ipsum`; documents outside every role are never held to a length), `integrity` (every `canon_facts.subjects` entry resolves to an
  entity key; every `significance='major'` entity has a non-empty `body`), `reveal` (share of facts with a
  `reveal_chapter`). `readyToDraft` is true only when `coverage` **and** `records` are both `strong`; `blockingGaps`
  holds exactly those gaps. `roles` lists every role with `coveredBy` (the addresses and record summaries that covered
  it), so an imported bible filed under other names reads as covered rather than missing. No model call — the response
  must be byte-identical on two consecutive GETs.
  **Quality:** the `gaps` strings are author-actionable (`"project/cast needs at least 3 character record(s) — found 1"`).
- **Fails when:** `readyToDraft` true while the Story Bible screen shows no entities (records dimension miscounted);
  a role reported missing while a document or record set named in its `role` carries it; `reveal` empty because every generated fact omitted `revealChapter`. For the low-fantasy sample, `power`
  still demands 4 `power_rule|concept` rows even with no numeric ladder — `concept` rows satisfy it, so a shortfall
  here means the builder emitted prose instead of records, not that the floor is wrong for the genre.

#### Bible audit

- **Entry:** Story Bible screen → **Run bible audit**; `POST /api/v1/projects/{projectId}/bible/audit`.
- **Preconditions:** `status='active'`. Most informative right after the builder, and again after you hand-delete an
  entity to prove the auditor notices.
- **Input:** none (empty POST).
- **Run:** 1. POST. 2. Read `findings[]`. 3. If a proposal came back, review it in **Proposals** and apply.
- **Verify:** run `graph='bible-audit'`, `target='bible'`, prompt `bible-audit@2.0.0`, role `audit`; context pack `purpose='audit'`
  (premise + first 5 lines of each doc), plus the rendered doc inventory, entity inventory and `renderManifest()`.
  Findings are keyed `doc:<section>/<slug>` or `entity:<entityKey>` with `action` ∈ `add|revise|remove|keep`.
  A clean bible returns findings and **no** proposal. Otherwise a `kind='bible_audit'` proposal stages
  `bible_document.upsert|remove`, `entity.upsert|remove` — and nothing is written until it is applied.
  **Quality:** the audit must judge against _this_ premise — for the sample (low-fantasy, no numeric progression) a
  `power/system-and-limits` finding should come back as a justified `keep`/`remove`, not a reflexive `add`.
  No unrevealed plot secret may appear in a document body or entity card (those belong in canon facts, which the audit
  does not write). Delete one `character` entity first: the audit should return an `entity:<key>` add and stage the
  `entity.upsert` that restores it — model output varies, so treat a miss as a weak-prompt signal rather than a crash.
- **Fails when:** findings reference docs/entities that do not exist; `changeSet` non-empty but no proposal row
  (`proposalService.create` failed); a `revise` that rewrites a document wholesale instead of filling the missing
  manifest topic; `model_calls.status='repaired'` from `validateChangeSet` rejecting out-of-vocabulary ops.
- **Cost:** 1 model call.

#### Bible / entity / canon-fact refinement — proposal-only writes

- **Entry:** applying anything from this path: `POST /api/v1/projects/{projectId}/proposals/{proposalId}/apply`
  (revert: `/revert`, discard: `/discard`; list: **Proposals** screen). Conversational refinement of an individual
  document or entity is the **refinement chat hub** (`/novels/$novelId/chat`) — covered in
  Part 5 (chat hub and admin).
- **Preconditions:** a pending proposal from premise-enhance, bible-audit, or a studio turn.
- **Input:** none for apply; `PATCH …/proposals/{id}` to select a subset of ops first.
- **Run:** 1. List proposals. 2. Apply. 3. Re-read the affected rows and the readiness score.
- **Verify:** `refinement_proposals.status` goes `pending → applied` (the other terminal values are `conflicted` when
  a baseline moved, `superseded`, `reverted` and `discarded`). The domain write and the status change are one
  transaction with a baseline conflict check —
  audit / premise / arc-plan / chat output must **never** appear in `bible_documents`, `entities` or `canon_facts`
  without a corresponding applied proposal (the studio's own `readiness` / `concepts` columns are the documented
  exception). `bible_documents.revision` and `content_hash` move on every upsert that changes the body — an upsert
  whose `content_hash` is unchanged is a no-op and leaves the revision alone. Direct author edits stay available:
  `PUT /api/v1/projects/{projectId}/bible/{section}/{slug}`, `PATCH …/entities/{entityKey}`,
  `PUT …/facts/{factKey}` (+ `POST …/facts/{factKey}/reveal`).
  **Quality:** `GET …/changes` then `POST …/changes/rollback` must restore the previous body exactly — an applied
  proposal that cannot be reverted is a defect.
- **Fails when:** `IDE_007` on a blanket manual apply that includes `action.graduate_seed`; status `conflicted` (the
  artifact moved under the proposal — expected, re-run the producer); `FCT_002` (a fact op names an unknown entity key);
  `ENT_001` / `DOC_001` / `FCT_001` on a removed target.

---

### End-to-end recipe — one small sample novel, stage by stage

Run this whole sequence once against the sample idea; keep the outputs and diff them against your baseline bible (a hand-written one, or one produced by a single prompt of your own). Total ≈ 18–25 model calls.

**Stage 0 — create the idea.** `POST /api/v1/seeds` with `{"spark": "<the sample spark>"}` (responds `201`).
☐ `projectId` + `sessionId` returned ☐ spark is `chat_messages` ordinal 1, verbatim ☐ `projects.title` becomes a real
name within a few seconds ☐ one `ideation-turn` run reached `completed`, and an `ideation-name` run exists in
`workflow_runs` although `GET …/runs` does not list it.

**Stage 1 — interview (≈6–8 turns).** Answer each round through `POST …/chat/sessions/{sessionId}/messages` with
`{"content": "<answer>"}` (1–200,000 characters). The sample spark is premise-shaped, so the studio normally extracts a
premise on the opening turn and the concept-card round is skipped — run the concept recipe separately on a spark with
no premise. Suggested answers, one per round: shelf = _low-fantasy city fantasy, heist-adjacent_; room = _the
Bellhouse and the flooded lower wards of Ghelvarn_; length = _open-ended, I'll run it for years; two chapters a week_;
tags = _civic memory, debt, guilt, craft_; cast = _one lead, and one POV only — Tin's_; hook = _the first bell she
rings cancels a debt that was keeping someone alive_; engine = _her hearing widens
while her own memory thins — the reader can count what she has lost_; want = _her mother's name struck off the
Bellhouse ledger_; refusal = _she will not ring a memory a living person still needs_; cost = _every ring takes a
year she cannot name_; foil = _Oren, the debt-clerk who taught her to read the ledger_; promise = _no memory is ever
restored for free; no romance solves the debt_; voice = _close third, past tense, dry, tactile_.
☐ `story_seeds.fields` carries all 8 stress-ready fields ☐ `asked_questions` contains every offered id, never a repeat
past 3 ☐ room landed as `constraints[].kind='scope'` under a `setting`-like key ☐ the cast answer locked a
single-viewpoint constraint, so `single-pov` appears in the next turn's `shape_playbooks` section and
`deepen.ironyBudget` is offered exactly once ☐ `deepen.renewal` is offered exactly once, forced by `orient.length`'s
open-ended follow-up off `serializationNotes` (a length answer filed as a sheet field matches no playbook)
☐ at least one `promise`-kind constraint exists ☐ every turn produced an auto-applied `kind='ideation'` proposal.

**Stage 2 — stress pass.** It fires automatically on the turn after the sheet completes; press **Run stress check** once
more from the panel.
☐ 7 dimensions in fixed order ☐ every non-`strong` verdict has a `fix` ☐ `promise` is `strong` (the constraint exists)
☐ the second press opened a second `ideation-stress` run with **no** `model_calls` row behind it (cache hit).

**Stage 3 — graduate.** `POST …/seed/graduate` with `{"title": "The Bell Debt"}`.
☐ zero model calls ☐ `projects.status='active'`, `premise`/`themes`/`instructions` populated ☐ `project/premise` and
`project/reader-promise` exist ☐ `canon_facts` holds one `source='seed'`, `reveal_chapter` NULL row per **distinct**
promise-constraint key — with both sample promises filed under the key `promise` expect a single `promise:promise`
row carrying only the second one (Finding 8) ☐ `story_seeds` row gone, ideation session archived
☐ `provenance.author + studio + crossed + unattributed = filled`.

**Stage 4 — give the project a brief.** `PATCH /api/v1/projects/{projectId}` with
`{"brief": "<the sample spark plus the locked shape: open-ended, single POV, low fantasy>"}` (or Settings → “Premise /
brief”). Graduation does not write `projects.brief`; the builder's **UI button** is what needs it, so this stage is
required to test the screen and optional if you only drive `POST …/seed-from-brief` directly.
☐ `projects.brief` non-empty ☐ the Story Bible empty state now offers **Generate story bible** instead of **Add a
brief in Settings**.

**Stage 5 — readiness, before.** `GET …/bible/readiness`.
☐ `coverage` thin — 1 of 7, since `project/reader-promise` serves no role ☐ `records` empty (0 of 4)
☐ `substance` judges only the premise role (against its 100-word floor); `project/reader-promise` is checked for
placeholder text only ☐ `readyToDraft` false
☐ `blockingGaps` holds 10 strings: the 6 missing manifest chapters plus the 4 unmet entity floors.

**Stage 6 — build the bible.** `POST …/seed-from-brief` with the brief, `force: false`.
☐ `node_trace` has all 8 nodes ☐ **`foundation` was skipped** because graduation already wrote `project/premise` —
confirm `counts.foundation = 0` and that downstream stages received the graduated premise as `{foundation}`
☐ all 7 manifest addresses present ☐ entity floors met (≥3 location/concept, ≥4 power_rule/concept, ≥4 faction/location,
≥3 character) ☐ character cards each have want + cost + a voice tic ☐ `lore_chunks` populated.

**Stage 7 — readiness, after.** `GET …/bible/readiness`.
☐ `coverage` strong ☐ `records` strong ☐ `readyToDraft` true ☐ note which roles `substance` still flags ☐ `reveal` shows how many generated facts got a `revealChapter`.

**Stage 8 — audit.** Delete one `character` entity, then `POST …/bible/audit` (empty body).
☐ an `entity:<key>` finding with `action: add` ☐ a staged `bible_audit` proposal containing the matching
`entity.upsert` ☐ apply it ☐ the entity is back and `records` returns to strong ☐ no unrevealed secret was written into
any document body.

**Stage 9 — optional, premise enhance (API only).** `POST …/premise/enhance` with `{"overview": "<the spark>"}`.
☐ `rationale` fields returned ☐ a `premise_enhance` proposal staged, nothing written ☐ apply it; `projects.premise`
moves through `premise.update`, and `project/premise` grows past the 250-word substance floor only if the model also
staged a `bible_document.upsert` — note which it did ☐ the enhanced premise still never states the ending.

**Stage 10 — compare.** Export the seven manifest documents + the entity roster and diff against your baseline bible on: antagonist presence, a named cost for every power rule, per-character want/wound/voice, escalation stated per
volume, and whether anything in the bible prose spoils a `canon_facts` reveal.

---

### Findings — code vs product doc, and seams worth reporting

1. **Graduation does not set `projects.brief`, and the bible builder reads only the brief.**
   `apps/novel-forge-server/src/modules/ideation/graduation.service.ts:99-113` writes
   `name/title/premise/themes/instructions`; `apps/novel-forge-server/src/modules/project/project/project.service.ts:108-120`
   never sets `brief`. `apps/novel-forge-web/src/routes/novels/$novelId/story-bible.tsx:539-547` refuses to run
   without one (`'Add a project brief in Settings before generating the bible.'`), so the headline path Idea → Bible
   has a manual copy-paste step in the middle. The API itself takes the brief in the request body and never reads
   `projects.brief`, so this is a UI-path gap only.
2. **The seed's own output barely reaches the builder.** `apps/novel-forge-server/src/modules/ai/graphs/bible-builder.graph.ts`
   templates take `projectBrief` plus
   previously written stage bodies only — it links **no context pack**, and never reads `project/reader-promise`, the
   `source='seed'` promise facts, the taste anchors, or the locked constraints. The one channel is indirect: because
   graduation already wrote `project/premise`, the `foundation` stage is skipped (`bible-builder.graph.ts:73-81`) and
   the graduated premise is what every later stage receives as `{foundation}`. This is the most likely reason a
   single prompt that sees the whole idea can out-write the harness here.
3. **`POST /api/v1/projects/{projectId}/premise/enhance` is unreachable from the web app.** Only
   `apps/novel-forge-web/src/lib/apis/api-types.gen.ts:1618` mentions it; no hook or component calls it (contrast
   `bible/audit` → `apps/novel-forge-web/src/lib/apis/refinement.api.ts:695` →
   `apps/novel-forge-web/src/routes/novels/$novelId/story-bible.tsx:436`). It is reachable via the chat hub's
   `action.enhance_premise` op.
4. **“Generate story bible” only exists in the empty state.** `apps/novel-forge-web/src/routes/novels/$novelId/story-bible.tsx:642-657`
   renders the button inside `EmptyState`, so once a single entity exists there is no UI path to a rebuild —
   `force: true` is API-only.
5. **`seed-from-brief` runs the whole 7-stage graph inside the HTTP request**
   (`apps/novel-forge-server/src/modules/generation/generation.service.ts:182`,
   `apps/novel-forge-server/src/modules/ai/graphs/workflow-run.service.ts:346`) with no job row unless a caller
   supplies `jobId`. Expect minute-scale requests and client timeouts that do not reflect the run's real outcome.
6. **Substance floor vs graduation output.** The floor is judged per role (`apps/novel-forge-server/src/modules/eval/bible-readiness.ts`,
   `substance`), with a 100-word floor for the premise; graduation's `project/reader-promise` serves no role and is only
   checked for placeholder text. A graduated idea whose premise is under 100 words still reads `substance: thin` —
   non-blocking, since `readyToDraft` reads coverage + records only.
7. Product doc `docs/novel-forge/novel-forge.md:55` and `:109` match the code (graduation deterministic; only proposal
   applies write domain tables, studio `readiness`/`concepts` excepted). No contradiction found on this path.
8. **Several reader promises graduate as one canon fact.** `deepen.promise`'s emission contract tells the model to
   file every promise under the key `promise`
   (`apps/novel-forge-server/src/modules/ideation/question-bank.ts`, `deepen.promise.intent`), and
   `apps/novel-forge-server/src/modules/ideation/graduation-render.ts:136-139` derives the fact key from that key,
   so `promiseFactKey` returns `promise:promise` for all of them. The `Map` in
   `apps/novel-forge-server/src/modules/ideation/graduation.service.ts:155-158` then keeps only the last, and the
   rest are dropped silently — they survive only as prose in `project/reader-promise`. The fallback to the
   constraint's text only fires when the key slugs to nothing.

---

## Part 3: planning, generation, finalize

All paths are prefixed `/api/v1`. `:projectId` is the numeric id (string of digits). UI screen labels are
exactly as `apps/novel-forge-web/src/components/Layout/screens.tsx` declares them. Code citations are
basenames within `apps/novel-forge-server/src` (server) or `apps/novel-forge-web/src` (`.tsx`).

### Shared preconditions (continue the project Part 2 built)

- A project of `kind: 'new_novel'`, `status` **not** `seed` (`POST /projects` → `{name, kind:"new_novel"}`;
  a graduated seed is already `active`). `translation`/`curated` kinds are refused with `PRJ_009`
  (`common/project-status.ts:20`), a seed with `IDE_004`. `kind: 'source'` also runs this pipeline.
- A graduated bible: `bible_documents` rows, `entities`, and (for the knowledge recipes) `canon_facts`.
  Check with `GET /projects/:projectId/bible/readiness` → `readyToDraft: true`, and the **Story Bible** screen.
- Admin scope (`novel-forge:admin`) for `GET /runs/:runId`, `/runs/:runId/context`, `/runs/:runId/calls/:callId`
  and the **Workflow Runs** screen — these are `@RequirePermission(ADMIN_PERMISSION, {highRisk:true})`
  (`generation.controller.ts:329,344,351`). Without it you cannot inspect the harness at all.
- The nav label is **Volumes & Arcs**; that screen's own heading reads "Story Plan" (`volumes.tsx:172`).
- JSON payloads below are wrapped to fit the page. Rejoin the wrapped lines before sending — a break that
  falls inside a quoted string is not valid JSON.

### Sample material

These recipes continue whichever project you graduated — normally _The Bell Debt_, the sample idea
Part 2 (Idea to lore bible) tells you to reuse verbatim. If you instead want a standalone project for this
doc alone, seed it with:

> **The Tidewright's Ledger.** In Calder Quay, debt is paid in remembered years: a tidewright can lift a
> memory out of a debtor and sell it on. Amara Veil, an eighteen-year-old ledger-clerk, discovers her own
> childhood is missing from the city's books — because someone paid it out to buy her mother's silence.
> She apprentices herself to the wrecker who holds the withdrawal slip, intending to steal it back before
> the Salt Assize forecloses on the Quay itself.

Entity/fact keys below (`amara_veil`, `rook_calder`, `salt_assize`, fact `amara_is_the_pledge`) are
**illustrative** — the bible builder coins its own. Read the real keys off the **Story Bible** and
**Canon Facts** screens and substitute them, because an unknown key is skipped in silence rather than
rejected: `applyBriefReveals` logs `brief reveals reference unknown keys — skipped` and ledgers nothing
(`bible/fact/knowledge-view.ts:195-203`), and an unresolvable `requiredContext` ref is dropped the same way.

---

#### Volume planning

- **Entry:** **Volumes & Arcs** screen → "Generate volumes" dialog; `POST /projects/:projectId/plan`.
  Requires `kind: new_novel|source`, status ≠ `seed`.
- **Preconditions:** bible documents exist (Part 2). No volumes needed — this creates them.
- **Input:** `{"volumeCount": 2, "chaptersPerVolume": 4}` (UI dialog defaults are 3 × 8; keep it at 2 × 4 so
  the whole chain below is 8 chapters). Optional `skeleton` overrides the derived one; omit it.
- **Run:** 1. Open **Volumes & Arcs**. 2. "Generate volumes" → Volumes 2, Chapters per volume 4 → submit. 3. Toast reads `Planned 2 volumes`.
- **Verify:** `volumes` gains 2 rows, `volumes.status='draft'`,
  `volumes.volume_key` / `ordinal` / `title` / `objective` / `conflict` / `payoff` / `start_chapter` /
  `end_chapter` / `target_chapter_count` all non-null. The ranges are the model's own — `target_chapter_count`
  is derived as `endChapter - startChapter + 1` (`generation.service.ts:250`) and only the approve step below
  makes them contiguous, so a plan of 1–4 / 5–8 is the expected shape but not enforced here.
  `model_calls` gains one row `prompt_key='plan'`, `prompt_version='1.2.0'`, `role='plan'`
  (`ai/prompts/plan.prompt.ts:16`) with `run_id` **null** — planning is a bare model call, not a graph, so
  it never appears on **Workflow Runs**. **Quality:** each volume's `objective`, `conflict` and `payoff` must be
  three _different_ statements — a payoff that restates the objective, or a conflict that is just "she must
  survive", is the harness under-performing. `cast` should name entity keys that actually exist in `entities`.
- **Fails when:** empty `volumes[]` (weak model read a blank skeleton — `generation.service.ts:203-213`
  is the fallback that should prevent it); `PRJ_009` on a translation/curated project; `IDE_004` on a seed;
  log line `plan: volumes upserted` with a count below `volumeCount`.
- **Cost:** 1 model call.

#### Volume plan approval (lays out chapter ranges)

- **Entry:** **Volumes & Arcs** → "Approve plan" (shown while any volume is `draft`);
  `POST /projects/:projectId/approve` — or the identical `POST /projects/:projectId/volumes/approve`.
- **Preconditions:** volume planning above.
- **Input:** no body.
- **Run:** 1. Click "Approve plan". 2. Toast `Volume plan approved`.
- **Verify:** response `{"volumesApproved":2,"approved":true}`. `volumes.status='approved'` for all non-`source`
  rows; `start_chapter`/`end_chapter` recomputed as **cumulative sums of `target_chapter_count` in ordinal
  order** starting at 1 (`bible/volume/volume.approve.ts:33-44`) — so ranges are 1–4, 5–8 with no gap and no
  overlap even if the model's own ranges disagreed. `volumes.revision` +1 and `content_hash` changes.
  `GET /projects/:projectId/status` → `planApproved: true`. No model call is made.
- **Fails when:** `PLN_002` — a volume has neither a `target_chapter_count` nor an explicit range;
  `approved:false` with `volumesApproved:0` when every volume is `status='source'` (imported novel).
- **Note:** the two routes share `approveVolumePlan`, so they cannot drift.

#### Arc planning (arc_plan proposal)

- **Entry:** **Volumes & Arcs** → open a volume → "Generate arcs" (the button reads "Re-plan arcs" once the
  volume already has arcs — `volumes.tsx:289`); `POST /projects/:projectId/volumes/:volumeKey/arcs/plan`.
- **Preconditions:** every volume `status ≠ 'draft'` **and** this volume has both chapter bounds, else
  `ARC_003` (`refine.service.ts:179-180`).
- **Input:** `{"arcCount": 2, "guidance": "Arc 1 is Amara inside the ledger house learning how a withdrawal is
written; arc 2 is the theft attempt at the Salt Assize. Do not resolve who signed her pledge."}`
- **Run:** 1. Open volume `vol_1`. 2. "Generate arcs". 3. Toast: `Arc plan proposed — review and apply it from
Proposals`. 4. Go to **Proposals**, open the `arc_plan` proposal, apply it
  (`POST /projects/:projectId/proposals/:proposalId/apply`).
- **Verify:** response carries `proposal`, `arcs[]`, `runId`. **Nothing is written to `arcs` until the proposal
  is applied** — that is the design (`refine.service.ts:218`). `refinement.proposals` row: `kind='arc_plan'`,
  `scope_type='arc_plan'`, `scope_ref='volume:vol_1'`, `allowed_ops` = `arc.upsert, arc.remove`.
  `model_calls`: `prompt_key='arc-plan'`, `prompt_version='1.0.0'`, `role='arc'`. After apply: `arcs` rows
  with `chapter_start`/`chapter_end` that **exactly partition** 1–4, `status='draft'`, `revision=1`.
  **Quality:** each arc's `escalation` must be a raise over the previous arc's, and `hook` must be a concrete
  handoff beat ("the slip is gone from the drawer"), not a mood. `body` should carry the `Ideas:` block.
- **Fails when:** `ARC_003` (plan not approved); `ARC_002` on apply when the arcs leave the volume range
  (`proposal-apply.service.ts:776`); arcs that overlap or leave a gap — visible immediately at the approve step.
- **Cost:** 1 model call.

#### Arc approval

- **Entry:** **Volumes & Arcs** → volume → "Approve arcs";
  `POST /projects/:projectId/volumes/:volumeKey/arcs/approve`.
- **Preconditions:** volume `status='approved'` with both bounds; arcs applied from the proposal.
- **Input:** no body.
- **Run:** 1. Click "Approve arcs". 2. Toast `N arcs approved`.
- **Verify:** `arcs.status='approved'`, `arcs.stale_reason=NULL` for every arc of the volume. The coverage
  invariant is checked first (`arc.service.ts:109-118`): ordered by `ordinal`, `chapterStart` must equal the
  previous `chapterEnd+1`, first must equal `volume.startChapter`, last must equal `volume.endChapter`.
  Deliberately break it — `PUT /projects/:projectId/arcs/arc_1_2` with
  `{"volumeKey":"vol_1","chapterStart":4,"chapterEnd":4}` when arc 1 ends at 2 (`volumeKey` is **required** by
  `UpsertArcBody`; every other field omitted keeps its stored value) — and re-approve → `ARC_002`. No model call.
- **Fails when:** `ARC_002` (gap/overlap/short coverage), `ARC_003` (volume not approved), `VOL_001`.

#### Arc-scoped outlining → per-chapter briefs

- **Entry:** **Volumes & Arcs** → arc → "Generate briefs" ("Regenerate briefs" once the arc's briefs exist —
  `volumes.tsx:392`); `POST /projects/:projectId/arcs/:arcKey/outline`.
- **Preconditions:** **every** arc of the volume approved, else `ARC_004` (`generation.service.ts:403`).
  While this arc is unapproved the UI shows "Brief generation needs every arc in this volume approved
  first — approve arcs from the volume page" (`volumes.tsx:395`).
- **Input:** `{"context":"Amara narrates. Keep the Assize off-page until arc 2."}` (`context` optional).
- **Run:** 1. Open arc `arc_1_1`. 2. "Generate briefs". 3. Toast `Drafted N chapter briefs for this arc`.
- **Verify:** `briefs` rows for exactly the arc's range, `arc_key` and `volume_key` set, `stale_reason=NULL`,
  `hand_edited=false`, `write_mode='standard'`. Every row must carry `ending_contract` (hookType,
  emotionalBeat, openQuestion, handoffState), `chapter_purpose`, `reader_value` (each value drawn from
  `new_information | relationship_change | power_or_stakes_change | goal_or_plan_change | world_state_change |
emotional_turn`), and `context_refs`. `model_calls`: `prompt_key='outline'`, `prompt_version='2.3.0'`.
  Coverage/chaining is post-validated (`validateOutlineCoverage`, `ai/schemas/outline.schema.ts:91`) — a missing
  chapter, a duplicate, an out-of-span chapter or an unlisted `readerValue` fails the call. This is the
  **structured-output** repair, not the judge ladder: the router re-prompts once with the issue list, then tries
  tolerant JSON extraction, then throws `AI_001`. A second `model_calls` row with `attempt=1` (or
  `status='repaired'`) is the tell that the first pass failed.
  **Quality:** `chapterPurpose` must not restate `objective`; `repetitionRisks` should name a real prior beat.
- **Invariant:** re-running never overwrites a protected brief — one that is `hand_edited`, has a draft, or
  whose chapter is finalized (`generation.service.ts:506`). Log: `outlineArc: preserved protected briefs`.
  Invented `requiredContext` refs are silently dropped (log `outline: dropped unresolved context refs`).
- **Fails when:** `ARC_004`; `ARC_001`/`ARC_002` (arc missing or has no range); zero briefs returned.
- **Cost:** 1 model call. _Legacy whole-book `POST /outline` still exists and is clamped to 25 chapters
  (`MAX_WHOLE_BOOK_OUTLINE_SPAN`); arc-scoped is the intended path._

#### Brief hand-edit + knowledge contract

- **Entry:** **Volumes & Arcs** → arc → brief → "Edit"; `PUT /projects/:projectId/briefs/:n`.
- **Preconditions:** a brief exists at chapter `n`.
- **Input:**
  `{"title":"The Withdrawal Slip","body":"Amara copies the day's withdrawals. She must NOT learn who signed her own pledge.",`
  `"knowledgeContract":{"pov":["amara_veil"],"learns":[{"entityKey":"amara_veil","factKey":"rook_holds_the_slip"}]}}`
  (one object — the two spans are split for width only).
- **Run:** 1. Open the brief. 2. Edit → paste → Save.
- **Verify:** `briefs.hand_edited=true` (this is what shields it from arc reconciliation),
  `briefs.knowledge_contract` stores **only** `{pov, learns}` — the service narrows it
  (`generation.service.ts:563`). `GET /briefs/:n` echoes it back. No model call.
  `body` is required and `knowledgeContract.pov` carries `minItems: 1`, so an omitted `body` or an empty
  `pov` is a 400 here, not a silent no-op (`ai/schemas/knowledge-contract.schema.ts:17`).
- **Fails when:** `DRF_001` if the upsert returns nothing. **Gap:** `PUT /briefs/:n` cannot set `writeMode` —
  the only ways to get `write_mode='external'` are the insert endpoint or a `brief.update` proposal op
  (`chapter-insert.service.ts:183`, `proposal-apply.service.ts:834`).

#### Chapter generation (happy path)

- **Entry:** **Chapters** screen → "Generate ch N"; `POST /projects/:projectId/generate` → **202**.
- **Preconditions:** ≥1 volume `approved|source` (else `PLN_001`); no draft with
  `review_status='contradiction'` (else `DRF_003`); briefs exist (else `BRF_001`); no stale brief in the batch
  (else `BRF_002`); the covering arc approved when the volume has arcs (else `ARC_004`).
- **Input:** `{"limit": 1}` — what the UI sends. For the ladder use `{"limit":1,"autoFix":true,"maxFixes":3}`.
- **Run:** 1. **Chapters** → "Generate ch 1". 2. Click the progress banner. 3. When it settles open the chapter.
- **Verify:** `jobs` row `kind='generate'`, `target='1'`, payload `{chapters,autoFix,maxFixes,guidance}`.
  `workflow_runs` row `graph='chapter-generation'`; `node_trace` should read
  `assembleContext → draftChapter → persistDraft → mechanicalCheck → judge → accept → finish`.
  `accept` is reached only when the verdict is `consistent` **and** all four compliance flags hold
  (`routeAfterJudge`, `chapter-generation.graph.ts:116`); with `autoFix` off, any miss routes to `awaitReview`
  instead and leaves `review_status='contradiction'`. A judge that simply omits `briefCompliance` counts as
  non-compliant (`:409`), so a weak judge model lands here on an otherwise clean chapter.
  `drafts`: `revision=0`, `generator='standard'`, `review_status='needs_review'`, `judge='consistent'`,
  `volume_key` set. `draft_revisions` gains `source='generated'` with the `run_id`.
  **Workflow Runs** screen → the run → `generation@2.5.0`, `judge@2.3.0`, tokens in/out, tool calls, and
  "Prompt anatomy" → "View full context" for the rendered pack (`runs.tsx:404,247,281`). `cost_usd` stays null
  for text calls — only image calls record one. `GET /projects/:projectId/drafts/1/prompt` returns the same pack.
  **Quality:** the draft must land the brief's `endingContract.hookType` on its last beat and must not open by
  recapping — read the last 5 lines against the brief's `handoffState`.
- **Fails when:** `PLN_001` / `DRF_003` / `BRF_001` / `BRF_002` / `ARC_004`; a second call while a job is
  `pending|in_progress` silently returns the _existing_ job (`generation.service.ts:589`); job `last_error`
  `chapter N generation failed (run …)`.
- **Re-running a chapter:** the batch is "briefs with no draft yet" — a chapter that already has a `drafts` row
  is skipped and the run moves on to the next one (`generation.service.ts:607,610`). To regenerate chapter N,
  `DELETE /projects/:projectId/drafts/:n` first (refused with `DRF_002` once the draft is `final`).
- **Cost:** ~2–3 calls (generation, 0–2 `chapter-expand@1.1.0` passes, judge, + `title@1.1.0` only if the
  writer returned no title).

#### PROVOKING the judge / repair ladder

- **Entry:** `POST /projects/:projectId/generate` with `autoFix`. **The UI never sends `autoFix`** — both
  buttons post `{limit}` only (`chapters.tsx:471`; `limit` 1 for "Generate ch N", 5 for "Draft the next 5
  chapters"), and no caller anywhere in `apps/novel-forge-web/src` sets `autoFix`, `maxFixes` or `guidance` on
  this route. The graph defaults `autoFix` to `false` (`chapter-generation.graph.ts:45`, `maxFixes` to 3 at
  `:46`) — so **the repair ladder is unreachable from the web app**. Send the body yourself, over the API, with
  `projects:write` + `generation:run`; the three fields ride the `jobs.payload` into the graph
  (`generation.service.ts:630` → `jobs/job.executor.ts:226,234`).
- **Preconditions:** chapter 1 generated, approved and **finalized** (a `chapters` row with `status='done'`) —
  the boundary-echo check reads finalized chapters only (`chapter-generation.graph.ts:309-314`). Chapter 2 must
  have a brief and **no draft yet**; `DELETE /drafts/2` between attempts or the run skips to chapter 3.
- **Input — three independent provocations:**
  1. _Mechanical, deterministic:_ `{"limit":1,"autoFix":true,"maxFixes":2,"guidance":"Somewhere in the middle,
repeat one entire paragraph of at least 30 words word-for-word, twice."}` → hard finding
     `mechanical: a paragraph is repeated verbatim — "…"` (`mechanical-check.ts:97`). The two copies must be
     whitespace-identical and separated by blank lines (paragraphs split on `\n\s*\n`); the threshold is 20
     words (`DUPLICATE_PARAGRAPH_MIN_WORDS`), so 30 gives margin. This one does not depend on the judge at all.
  2. _Boundary echo:_ `guidance: "Open chapter 2 by reprinting the final paragraph of chapter 1 verbatim
before continuing."` → hard finding `mechanical: chapter opens by repeating the previous chapter's ending
verbatim — "…"`. It compares the last 60 words of the highest-numbered **finalized** chapter below 2 against
     the draft's first 60 and needs one shared 6-gram, so the echo must land in the opening lines.
  3. _Continuity contradiction:_ `PUT /briefs/2` with a body that contradicts chapter 1's canon — e.g. "Rook
     Calder is waiting at the dock, unhurt" after chapter 1 established he was maimed — then generate.
     The judge should return `verdict:'contradiction'`; the finding's severity is the model's own call, and
     the verdict alone is enough to enter the ladder.
     Two more routes in by accident, worth recognising rather than chasing: a draft under 1,200 words is a hard
     `mechanical` finding after the expansion passes give up, and an omitted `briefCompliance` is one every time.
- **Run:** `DELETE /drafts/2`, POST with `autoFix:true`, then `GET /projects/:projectId/runs` → the run → open it.
- **Verify:** `workflow_runs.node_trace` shows the detour, e.g. `… judge → repairPatch → persistDraft →
mechanicalCheck → judge → …`; a patch whose `find` anchor is not unique falls through to `repairRewrite`
  (`routeAfterPatch`, `chapter-generation.graph.ts:123`). `model_calls` gains one `fix` row per patch attempt
  and a second `generation@2.5.0` per rewrite. **`prompt_version` on the fix row reads `1.0.0`, not the
  `1.2.0` that `ai/prompts/fix.prompt.ts:29` declares** — `repairPatch` hardcodes the telemetry version
  (`chapter-generation.graph.ts:461`), so filter those rows on `prompt_key='fix'` / `role='fix'`, never on the
  version. `drafts.revision` increments once per persisted attempt; `draft_revisions.source` reads `patched`
  for **every** post-first attempt, rewrites included — `repairRewrite` resets `repairMode` to `'patch'` before
  `persistDraft` computes the source (`:567` vs `:247`), so the `rewritten` enum value is never written. Tell
  the two apart by the node trace and by which prompt the attempt's `model_calls` row names.
  Ladder exits: `accept` (clean) / `acceptAsIs` at `attempt >= maxFixes` or when a finding repeats verbatim (`sameFinding`) → outcome
  `accepted_with_findings`, `review_status='contradiction'` / `awaitReview` when `verdict='evaluation_failed'`
  or `autoFix:false` → outcome `awaiting_review`. `drafts.judge_note` lists every finding as `[severity] text`.
  **Batch:** anything other than a clean `accepted` **halts the whole batch** — log
  `runGenerate: halting batch for review` and job progress `phase:'awaiting_review'` with `skipped:[…]`
  (`jobs/job.executor.ts:244-246`).
- **Fails when:** `briefCompliance` missing from judge output is counted as non-compliant
  (`chapter-generation.graph.ts:409`) — a weak judge model will loop the ladder on that alone; watch for the
  finding `brief: judge omitted briefCompliance — treated as non-compliant`.
- **Before the next provocation:** every non-`accepted` exit leaves `review_status='contradiction'`, and the
  next `POST /generate` refuses with `DRF_003` for the whole project. Its message reads "resolve or use
  autoFix", but the check runs before `autoFix` is read (`generation.service.ts:594`) — sending `autoFix:true`
  does **not** get past it. Clear it first: approve the draft, revise it, or `DELETE /drafts/:n`.
- **Cost:** up to `maxFixes` × (1 fix-or-generation + 1 judge) on top of the base.

#### Standalone judge + mechanical check outside the graph

- **Entry:** **Chapters** → open a chapter → "Verify"; `POST /projects/:projectId/drafts/:n/judge`.
- **Preconditions:** a draft with prose.
- **Input:** no body.
- **Run:** 1. Open chapter. 2. "Verify". 3. Toast is `Judge verdict: consistent` or
  `Judge flagged a contradiction — open review for details`. 4. Click the status pill → "Judge review" drawer.
- **Verify:** response `{verdict, findings[]}`; `drafts.judge`, `drafts.judge_note`, and
  `drafts.review_status` = `needs_review` when consistent else `contradiction` (`generation.service.ts:808`).
  **Note the asymmetry with the graph:** this path runs **no mechanical check** and no ending/knowledge/brief
  compliance merge — it is continuity only. An unparseable judge output is retried once, then recorded as
  `verdict='evaluation_failed'` with a hard finding `judge output unparseable`.
- **Fails when:** `DRF_001`; verdict `evaluation_failed` twice running means the judge model cannot emit the
  schema — check `model_calls.raw_output` via `GET /runs/:runId/calls/:callId`.
- **Cost:** 1–2 calls (+ tool calls, max 4 rounds).

#### Revise from feedback

- **Entry:** **Review Queue** → chapter → `R` (revise); `POST /projects/:projectId/drafts/:n/revise`.
- **Preconditions:** draft exists and `status != 'final'` (else `DRF_002`).
- **Input:** `{"note":"The withdrawal scene is summarized, not dramatized. Put Amara's hands on the ledger,
show the clerk's tell, and cut the two paragraphs of Quay history."}`
- **Run:** 1. **Review Queue** → pick the chapter. 2. Press `R`, paste the note, submit. 3. Toast `Chapter N revised — re-review the new draft`.
- **Verify:** `user_feedback` row `artifact_type='draft'`, `disposition='revision_requested'` with the note;
  `drafts.revision` +1, `review_status` back to `needs_review`, `stale_reason=NULL`; `draft_revisions` row
  `source='revised'` linked to that `feedback_id`. `model_calls`: `revision@1.1.0`.
  **Every descendant draft is marked stale** — `drafts.stale_reason = 'ancestor chapter N was revised'`
  for chapters > N (`markDescendantDraftsStale`). **Quality:** diff `GET /drafts/:n/revisions/:r` against the
  previous revision — the note's three asks must each be visible; a revision that only rewords is a failure.
- **Fails when:** `DRF_002` on a finalized draft; `DRF_001`; revised body shorter than the floor (no expansion
  pass runs on this path — `reviseDraft` does not call `expandShortDraft`).
- **Cost:** 1 model call.

#### Draft approval (and the deterministic reveal gate)

- **Entry:** **Chapters** → "Approve draft", or **Review Queue** → `A`;
  `POST /projects/:projectId/drafts/:n/approve`.
- **Preconditions:** draft not `final` (`DRF_002`) and not stale (`DRF_007`). The UI disables the button while
  `review_status` is `contradiction` or `generating`.
- **Input:** `{"idempotencyKey":"approve-ch1-attempt-1"}` (optional; `reviewerId` optional).
- **Run:** 1. Approve. 2. Re-POST with the _same_ `idempotencyKey`.
- **Verify:** `drafts.review_status='approved'`; one `user_feedback` row `disposition='approved'` — the retry
  adds none (unique `idempotency_key`, `onConflictDoNothing`). **In the same transaction** the brief's
  `knowledgeContract.learns` become `character_knowledge` rows with `learned_in_chapter = n`, `source='brief'`
  (`bible/fact/knowledge-view.ts:176`); log `brief reveals ledgered`. Unknown entity/fact keys are skipped with
  the warn `brief reveals reference unknown keys — skipped` — check the **Canon Facts** screen for the fact's
  knowledge list. No model call.
- **Fails when:** `DRF_007` (regenerate first), `DRF_002`, `DRF_001`.

#### Finalize + continuity write-back

- **Entry:** **API only — there is no UI caller.** The path appears in `apps/novel-forge-web/src` only inside
  the generated client (`lib/apis/api-types.gen.ts:861` is its path key), never in a route or api module. Do
  not confuse it with the translation pipeline's own
  `/projects/:id/translation/chapters/:chapter/finalize`, which _is_ called (`lib/apis/translation.api.ts:228`).
  `POST /projects/:projectId/finalize`.
- **Preconditions:** the draft is `approved` (else `DRF_004`); chapter `n-1` already has a `final` draft (`FIN_001`); no earlier
  chapter with `chapters.needs_revalidation=true` (`FIN_002`); the latest `novel`-scope validation report has
  no `error` for this chapter (`FIN_003`); an isolated draft needs a non-blank summary **and** a non-empty
  `state` (`CHP_005`, `common/finalize-gate.ts`).
- **Input:** `{"chapter": 1}` — or `{}` to take the lowest `approved` draft.
- **Run:** 1. POST. 2. `GET /projects/:projectId/runs` → the `chapter-finalization` run. 3. `GET /projects/:projectId/review-queue` → `proposals[]`.
- **Verify:** `node_trace` = `guard → commitProse → extractContinuity → applyContinuity → updateIndexes →
advanceCursor → finish`. `chapters` row: `status='done'`, `locked=true`, `word_count`, `content` sanitized;
  `drafts.status='final'`, `review_status='final'`. `continuity_proposals` row written with
  `model` and `status='pending'`, then flipped to `applied` + `applied_at` — **unless the delta holds any
  `confidence:'low'` entry**, in which case it stays `pending` and is rewritten down to just the held entries
  (`apply-continuity.ts:14,23`). `chapters.continuity_applied=true`; `projects.story_current_chapter` = n and
  `story_current_volume_key` set. An **isolated** draft skips extraction entirely, so it writes no proposal and
  leaves `continuity_applied=false` — that is by design, not a half-finalize
  (`chapter-finalization.graph.ts:162`). Canon written: `entities` (+`entity_appearances`), `plot_threads`,
  `mysteries`, `character_states`, `relationships`; `timeline`, `power` and `knowledgeChanges` are deliberately
  never persisted. `model_calls` records the continuity call as `continuity@1.0.0`, **not** the `1.3.0` that
  `ai/prompts/continuity.prompt.ts:16` declares — the graph hardcodes the telemetry version
  (`chapter-finalization.graph.ts:203`). The `propose-continuity` route below records `1.3.0` correctly, so the
  same prompt shows two versions depending on which path made the call.
  Every `generation.reconciliation.cadence` finalized chapters inside an arc (default 5 — `bootstrap.ts:62`),
  or as soon as a later brief is stale, the arc is silently re-outlined (log `finalize: reconciling arc
briefs`); it never fires on the arc's own last chapter, so short arcs may never reconcile at all. The last
  chapter of a volume writes `volumes.epitome` via `epitome@1.0.0`, once, and only for an `approved` volume.
  **Quality:** read `continuity_proposals.proposal.chapterSummary` — it must state what
  _changed_, not recap the scene, and its `threads` must reuse existing `thread_key`s, not coin duplicates.
- **Fails when:** `FIN_001`/`FIN_002`/`FIN_003`/`CHP_005`/`DRF_004`; `[guard] Chapter N is not next in sequence`;
  `[extractContinuity] … already in progress` (a 5-minute claim lease is live); a half-finalized chapter
  (draft `final`, `chapters.continuity_applied=false`) is resumable — re-POST and watch for the warn
  `finalize: resuming a partially finalized chapter`.
- **Cost:** 1 continuity call (+1 epitome at a volume end, +1 outline per reconciliation).

#### Continuity proposal review (low-confidence hold)

- **Entry:** **API only.** `/chapters/:n/continuity-proposal*` has no web client — the paths exist in
  `lib/apis/api-types.gen.ts` and nowhere else. **Confirmed dead end in the UI:** the **Review Queue** empty
  state offers "Review N continuity proposals", counted from `GET /review-queue`, and links to **Proposals**
  (`review.tsx:302-303`) — but that screen loads `GET /projects/:projectId/proposals`, the _refinement_
  collection (`lib/apis/refinement.api.ts:627`, consumed at `proposals.tsx:313`), which never contains a
  continuity proposal. The link can only ever show the wrong list.
  `GET|PATCH /projects/:projectId/chapters/:n/continuity-proposal`, `…/apply`, `…/discard`.
- **Preconditions:** a `pending` continuity proposal (finalize left one held, or run
  `POST /chapters/:n/propose-continuity` to make a fresh one).
- **Input (PATCH):** `{"proposal": {…edited delta…}}` — the whole delta, replacing the stored one.
- **Run:** 1. `GET` the proposal. 2. `PATCH` a `confidence` from `low` to `high` on one thread. 3. `POST …/apply`.
- **Verify:** `GET /review-queue` lists it under `proposals`. After apply: `continuity_proposals.status`
  becomes `applied` **only when no `low` entry remains**; otherwise it stays `pending` with the proposal
  narrowed to the held entries. `chapters.continuity_applied=true` either way.
  A thread already advanced past this chapter is skipped (warn `thread already advanced past this chapter`).
- **Fails when:** `CNT_001` (no pending proposal); an `appeared` entity key that does not exist is skipped with
  a warn rather than failing — check `entity_appearances` actually gained rows.
- **Cost:** `propose-continuity` = 1 call (`continuity@1.3.0`); apply/discard = 0.

#### Extraction to bible

- **Entry:** **Chapters** → chapter → "Add to bible";
  `POST /projects/:projectId/chapters/:n/extract-to-bible`.
- **Preconditions:** a draft with prose. Best tested on a **hand-written or unrestricted** chapter, whose canon
  never went through the finalization extractor.
- **Input:** no body.
- **Run:** 1. Open the chapter. 2. "Add to bible". 3. Toast `Canon proposal drafted — review it on the
Proposals page`. 4. **Proposals** → open → apply.
- **Verify:** `refinement.proposals` row `kind='chapter_extract'`, `scope_type='brief'`,
  `scope_ref='chapter:N'`, `allowed_ops` = `entity.upsert, entity.remove, bible_document.upsert,
bible_document.remove`, `model` recorded. `model_calls`: `chapter-extract@1.0.0`, `role='extraction'`.
  After apply, the new entities/documents show on **Story Bible**.
  **Quality:** the change-set must contain only canon the chapter _establishes_ — a proposal that re-upserts
  entities already in the bible unchanged means the extractor is not diffing against the context pack.
- **Fails when:** `DRF_005` "Chapter adds no new canon to the bible" — expected on a chapter whose canon was
  already extracted at finalize; `DRF_001`.
- **Cost:** 1 model call.

#### Whole-novel validation

- **Entry:** **API only** — the path appears in `apps/novel-forge-web/src` only as the generated client's path
  key (`lib/apis/api-types.gen.ts:998`), with no caller. `POST /projects/:projectId/validate`.
- **Preconditions:** ≥1 chapter with `chapters.status='done'`. Windows are one per volume when volumes exist,
  otherwise 20-chapter slides (`novel-validation.graph.ts:98-108`).
- **Input:** no body.
- **Run:** 1. POST. 2. `GET /projects/:projectId/runs` → the `novel-validation` run.
- **Verify:** `node_trace` = `planWindows → validateWindows → mergeFindings → persistReport`.
  A `validation_reports` row with `scope='novel'`, `chapter=NULL`, `issues` count, and a payload carrying
  `issues[]`, `summary`, `windowsRequested`, `windowsSucceeded`, `failedRanges[]`. `chapters.needs_revalidation`
  is rewritten **only for finalized chapters inside a window that actually succeeded**
  (`novel-validation.graph.ts:224-237`) — set where that chapter has an `error` issue and _cleared_ where it
  does not, while a failed or unrequested window leaves an earlier flag alone.
  `model_calls`: `validation@1.0.0` once per window.
  Issues are deduplicated by lowercased description and `error` severity sorts first.
  **Quality:** each issue should cite a chapter number and the canon it conflicts with; a report of vague
  "pacing could be tighter" notes means the validation prompt is not doing continuity work.
- **To provoke:** amend chapter 1 (below) to contradict chapter 2, then validate → expect an `error` issue on
  chapter 2, `chapters.needs_revalidation=true`, and the _next_ finalize refused with `FIN_003`/`FIN_002`.
- **Fails when:** `windowsSucceeded: 0` with summary `No windows could be validated this run` (model or pack
  failure — each window failure is logged non-fatally as `validateWindows: window failed`).
- **Cost:** 1 call per window.

#### Interstitial insert

- **Entry:** **Chapters** → split-button menu → "Insert a chapter ahead of ch 1" (disabled once anything is
  finalized), or a chapter row's "Insert a chapter after N";
  `POST /projects/:projectId/chapters/:afterChapter/insert`.
- **Preconditions:** project not `seed`; `afterChapter >= max(finalized chapter number)` (`CHP_003`);
  `afterChapter <= max(chapter, brief)` (`CHP_001`); **no active `generate` job** (`CHP_004`).
- **Input (planner):** `{"briefOrigin":"planner","intent":"A quiet chapter where Amara reads her mother's
own withdrawal slip and realizes the handwriting is hers."}`
  **Input (hand):** `{"briefOrigin":"hand","briefBody":"…the brief, stored verbatim…"}`
- **Run:** 1. Menu → insert after chapter 2. 2. Confirm the "What this changes" dialog.
- **Verify:** response `{brief, newChapter, shiftedChapters}`. Everything above the insert point is renumbered
  in a two-phase negate-then-land pass across **every** chapter-keyed column
  (`chapter-insert.service.ts:67-105`): `briefs.chapter`, `drafts.chapter`, `chapters.number`,
  `continuity_proposals.chapter`, `context_packs.chapter`, `entities.first_seen_chapter`,
  `canon_facts.reveal_chapter`, `character_knowledge.learned_in_chapter`, `plot_threads.*_chapter`,
  `mysteries.*_chapter`, `beats`, `world_facts`, `character_states`, `entity_appearances`, `chapter_images`.
  The new brief has `write_mode='external'`, `hand_edited=true`, `inserted_at` non-null, and the covering
  arc/volume grew by one (`arcs.chapter_end+1`, `volumes.end_chapter+1`, `target_chapter_count+1`) **silently,
  with no `stale_reason`**. Shifted briefs have their body/`context_refs`/`knowledge_contract` chapter
  references rewritten. Descendant drafts get `stale_reason='a chapter was inserted after this point'`.
  `chapter_publications` is deliberately **not** shifted.
- **Fails when:** `CHP_003` / `CHP_001` / `CHP_004`; `S003` (`briefBody` missing for `hand`, `intent` for
  `planner`); a `arcs_chapter_range_check` constraint violation would mean the grow order regressed.
- **Cost:** 0 model calls for `hand`; 1 `outline@2.3.0` call for `planner`.

#### Unrestricted fill / `external` write mode

- **Entry:** **Chapters** → an unwritten ("Not written") row → "Fill slot" → "Generate unrestricted" or
  "Paste prose"; `POST /projects/:projectId/chapters/:n/generate-unrestricted` / `POST /drafts/:n/import`.
- **Preconditions:** the brief at `n` (an inserted slot already has `write_mode='external'`); the draft must
  not be `final` (`DRF_002`).
- **Input:** `{"guidance":"The maiming at the breakwater, on the page. Amara does not look away.",
"contentRating":{"violence":"graphic"}}` — or import
  `{"prose":"…","title":"Breakwater","summary":"Rook loses the hand; Amara keeps the slip.","isolated":true,
"state":{"rook":"maimed, left hand"}}`
- **Run:** 1. Fill the slot. 2. Back on **Chapters**, run `POST /generate` with `{"limit":5}`.
- **Verify:** the draft has `generator='unrestricted'`, **`isolated=true` always** (forced —
  `generation.service.ts:1160`), `review_status='needs_review'`; an `UnrestrictedBadge` shows in the editor
  header. Descendant drafts go stale (`ancestor chapter N was regenerated`).
  **Batch truncation:** `selectGenerationBatch` _stops_, never skips, at an unfilled `external` slot
  (`common/batch-selection.ts:25`) — the 202 response carries `stoppedAtExternalChapter: N` and the UI toasts
  `Batch stopped at chapter N — it is written outside the primary model`. The stop only lifts once that
  chapter is **finalized** (a `chapters` row), not merely drafted.
  Isolated prose is firewalled from the vector index, continuity extraction, and the adjacency rule — confirm
  `GET /projects/:projectId/search?q=<a phrase from it>&index=prose` returns no hit.
- **Fails when:** `DRF_002`; `CHP_005` at finalize because an isolated draft has no summary/state — use
  `POST /chapters/:n/summarize` (returns `{summary,state}` **unpersisted**; save via `PUT /drafts/:n`, whose
  `body` field is required, so resend the prose alongside the summary or you will blank it), the UI's
  "Finalize is blocked until this chapter is summarized" alert; `CHP_007` if the draft has no prose.
- **Cost:** 1–3 calls (generation + expansion) for unrestricted; 1 (`chapter-summarize@1.0.0`) for summarize;
  0 for import.

#### Amend a finalized chapter

- **Entry:** **Chapters** → a `final` chapter → "Amend"; `POST /projects/:projectId/chapters/:n/amend`.
- **Preconditions:** `chapters.status='done'` (else `CHP_006`); project not `seed`.
- **Input:** `{"content":"…full replacement prose…","title":"The Withdrawal Slip",
"note":"Rewritten after the Assize timeline changed."}`
- **Run:** 1. Open a finalized chapter. 2. "Amend" → paste → confirm.
- **Verify:** response `{chapter, wordCount, indexed, republished, publicationRevision?, suggestExtractToBible:
true}`. `chapters.content` replaced, `word_count` recomputed, **`locked` stays `true`** — amend is the only
  write past the lock and it never unlocks (`chapter-amend.service.ts:53,63`). A `draft_revisions` row with
  `source='amended'` at `max(draft.revision, latest.revision)+1`. Re-embedding happens **after** the
  transaction; on failure the chunks are dropped and `indexed:false` (fix with `POST /backfill`).
  Republish only when the reader payload hash moved. The UI then shows the "Canon was not re-derived" alert —
  **the bible, continuity and downstream chapters are untouched by design**; the follow-up is "Add to bible".
- **Fails when:** `CHP_006` (chapter not finalized), `CHP_001`, `IDE_004`; log
  `amend: could not drop the superseded chunks; the index still holds pre-amend prose` — retrieval will serve
  deleted prose until a backfill.
- **Cost:** 0 model calls (embeddings only).

#### Character-knowledge / canon-fact leak protection

- **Entry:** `PUT /projects/:projectId/facts/:factKey` + a brief `knowledgeContract` + generation.
  UI: **Canon Facts** screen.
- **Preconditions:** the POV entity exists in `entities`; a brief at the chapter under test.
- **Input:** 1. fact —
  `PUT /facts/amara_is_the_pledge` `{"text":"Amara's own childhood is the collateral on the Veil debt.",
"subjects":["amara_veil"],"constraintNote":"Protects the pledge reveal.","writerNote":"Anyone who knows this cannot let Amara near the Veil ledger
alone.","terms":["the Veil pledge","collateral childhood"],"revealChapter":7}` 2. brief — `PUT /briefs/3` with
  `"knowledgeContract":{"pov":["amara_veil"],"learns":[]}` (Amara has no ledger row for the fact yet). 3. `POST /generate` with `{"limit":1,"autoFix":true,"guidance":"Have the ledger clerk say the words 'the
Veil pledge' out loud to Amara."}` — the guidance is the provocation, and `autoFix` is what lets the leak
  finding reach the ladder rather than stopping at review.
- **Run:** POST generate, then open the run on **Workflow Runs**.
- **Verify:** three layers must be visible. (a) _Pack filtering_: the pack can gain `known_facts` (ledgered,
  with keys), `chapter_reveals` (this chapter's `learns`) and `hidden_constraints` — each section is emitted
  only when non-empty, so with the cold ledger and `learns: []` above **only `hidden_constraints` appears**.
  It renders the `writerNote` alone, never the fact's key, text or `constraintNote` (a fact without a `writerNote` is left out)
  (`forChapter` and `renderHiddenConstraints`; section refs carry the key but are not part of `rendered`). Read it
  at `GET /drafts/3/prompt` and confirm the words "collateral childhood" appear nowhere.
  (b) _Judge asymmetry_: the judge's human message carries a `## FORBIDDEN KNOWLEDGE`
  block with the full text — `source='seed'` facts are excluded on purpose
  (`chapter-generation.graph.ts:367`) — and returns `knowledgeCompliance`. (c) _Deterministic pre-scan_:
  `scanKnowledgeLeaks` word-boundary-matches each `terms[]` entry (≥3 chars, case-insensitive) and **forces**
  non-compliance regardless of what the model said (`mergeKnowledgeCompliance`). Expect a soft finding
  `knowledge leak: "the Veil pledge" exposes [amara_is_the_pledge] — …excerpt…` in `drafts.judge_note`, and
  the ladder re-entered — which needs `autoFix:true`, since a soft finding with `autoFix` off routes to
  `awaitReview` like any other. At most one issue is raised per fact (the scan breaks on the first matching
  term). "Known" is recomputed from the ledger each run: a fact is known only if a POV entity
  has a `character_knowledge` row with `learned_in_chapter < n`.
- **Fails when:** the contract is ignored entirely — `parseKnowledgeContract` returns `null` unless `pov` has
  at least one non-empty string (`knowledge-view.ts:62`), so a contract with an empty `pov` disables the whole
  feature in silence. `PUT /briefs/:n` cannot produce that state (`minItems: 1` rejects it at the DTO), so it
  only arises from an outliner-written or proposal-written contract — check `briefs.knowledge_contract`
  directly if the layers below never fire. A fact with no `terms[]` gets no pre-scan and relies on the judge
  alone; terms under 3 characters are skipped; a `source='seed'` fact is excluded from the judge's list.
- **Cost:** pre-scan is free; the judge call is the one already made per attempt.

#### Harness observability (use for every block above)

- **Entry:** **Workflow Runs** screen (admin-only); `GET /runs`, `GET /runs/:runId`,
  `GET /runs/:runId/context`, `GET /runs/:runId/calls/:callId`, `GET /ai-usage`,
  `GET /context/preview?purpose=generation&chapter=3`.
- **Verify:** `GET /runs` lists only the 20 latest author-facing graphs (an allowlist —
  `generation.service.ts:125`); the detail carries `modelCalls[]` (`promptKey@promptVersion`, `role`,
  `provider`, `model`, `inputTokens`/`outputTokens`, `latencyMs`, `costUsd`, `attempt`, `status`),
  `toolCalls[]` (`tool`, `args`, `resultDigest`), `nodeTrace[]` and a `contextPack` breakdown
  (`sections[]` with `key`/`tier`/`segment`/`tokens`/`truncated`, `budgetTokens`, `usedTokens`).
  `…/context` adds the exact `rendered` text; on screen that is "Prompt anatomy" → "View full context"
  → the "Rendered prompt context" dialog (`runs.tsx:404,247,281`), not a tab.
  `GET /ai-usage` aggregates per role — its `costUsd` totals count image calls only, since text calls write no
  `model_calls.cost_usd`, so read them as a floor rather than a spend figure.
  A `truncated: true` section, or `usedTokens` pinned at `budgetTokens`, is the harness dropping canon the
  draft needed — the most useful single signal when output quality is poor.
- **Fails when:** `CTX_001` — no context pack linked to the run (the graph links it in `assembleContext`, so
  an unlinked run failed before drafting); 403 without the admin scope.

---

## Part 4: manuscript pipelines (source, rebrand, reforge, translation)

Scope: novel import, source extraction, consolidation, skeleton, recombine, rebrand, reforge (chapter + transform), translation, curated ingest.
Code read under `apps/novel-forge-server/src/modules/...` and `apps/novel-forge-web/src/...`.
Nothing here has been run against a live server or a model, so every AI-output expectation is a prediction from code. The deterministic parts were run
locally: S1/S2/S4 pass `ImportNovelBody` + `validateNovelBundle`, S3 passes `OriginalChapterBody`, the ingest bodies pass `IngestNovelBody`/`IngestChapterBody` and the recipe-2.8 plan body passes
`ReforgePlanSpansBody` + `validateTransformPlan`; `parseTitleParts`/`buildGroupingPlan` were run on S2, `computeAnalysisSignals` on S1, and `deriveOutputNumbering` on the plan body.
Legend: **[AI]** = a model call, **[det]** = deterministic code (a bug there is a code bug, not a model bug). `P` = projectId. API base `http://localhost:8080`. Run endpoints need session auth, or a bot
key carrying `novel-forge:projects:read` (class-level on every project controller) plus `novel-forge:projects:write` and `novel-forge:generation:run`; the run-detail endpoints additionally need
`novel-forge:admin`.

### 0. Read first

**Observe every run**

- Job: `GET /api/v1/jobs/:jobId` (poll to `done|failed`; project list: `GET /api/v1/projects/:P/jobs`). Runs: UI **Workflow Runs** (`/novels/$novelId/runs`, needs `novel-forge:admin`; a non-admin gets an in-place "Workflow Runs needs the admin scope" panel, not a redirect), API `GET /api/v1/projects/:P/runs` (read scope only), admin-only `GET .../runs/:runId`, `.../runs/:runId/context` (the exact pack), `.../runs/:runId/calls/:callId`. Spend: `/ai-usage` (understates: `cost_usd` is recorded only for image calls); `GET /api/v1/projects/:P/cost` is a stub.
- SQL (`run_id` is a varchar equal to `workflow_runs.id`):
  `select graph,target,status,outcome,node_trace from workflow_runs where project_id=P order by started_at;`
  `select run_id,node,role,model,prompt_key,prompt_version,status,attempt,input_tokens,cached_input_tokens,output_tokens,latency_ms,cost_usd from model_calls where project_id=P order by id;`
  `model_calls.raw_output` is the model's literal answer: read it for every quality check below.
- Default routing (`ai/defaults.ts:85-88`): `rebrand|reforge|translate` -> writing group `moonshotai/kimi-k3`; `extraction|skeleton|plan` -> planning `z-ai/glm-5.2`; `judge|audit` -> review `anthropic/claude-sonnet-5`. An Unrestricted-tier account uses a different map (`:101-104`: writing `x-ai/grok-4.6`, review `deepseek/deepseek-v4-pro`), and account/project overrides win, so read `model_calls.model` before judging a result.
- **Silent cache**: roles `judge, validation, continuity, extraction, review, audit, compact` are served from `llm_cache` on an identical request (`model-router.service.ts:67,368`) and write NO `model_calls` row. A re-run on unchanged text costs nothing and looks like "no AI happened". To force a fresh call change the input or delete the `llm_cache` row. Creative roles (rebrand, reforge, translate, recombine) are never cached.
- Prose paragraphs must be separated by a blank line (`\n\n`); translation segmenting and paragraph-drift checks depend on it.

**Defects found in code (they change what "pass" means; confirm at runtime)**

- D1 **Source extraction cannot run.** `ai/prompts/extraction.prompt.ts:16` template needs `{contextPack}` and `{chapterNumber}`; `ai/graphs/source-extraction.graph.ts:73-78` passes only `chapterProse` and `entityRoster`, so LangChain's `formatMessages` throws `Missing value for input variable contextPack`. The throw happens in `buildMessages` (`model-router.service.ts:350,581`), which runs before the `llm_cache` probe (`:368`) and before any model call, so expect run `failed`, zero `model_calls`, job `failed` on chapter 1. `tests/ai/prompts.spec.ts` renders the templates of ~20 prompts but never `extraction`, which is how this survives CI. It also starves Skeleton and the rebrand seed pack (empty entities/world facts).
- D2 `POST /consolidate` promotes relationships from `relationship_observations` (`consolidate.service.ts:47-81`), and nothing in `apps/novel-forge-server/src` ever inserts into that table (`chapter-insert.service.ts:85` only shifts its chapter numbers), so `relationshipsPromoted` is always 0. Consolidate is not AI.
- D3 The UI config cards overwrite `settings` wholesale: the Rebrand card sends exactly `{bannedExtra,auditEnabled}` (`rebrand.tsx:79`), the Reforge card sends `{judgeEnabled}` plus `targetWords` only when the field parses to a positive integer (`reforge.tsx:83`); `updateConfig` assigns the object as-is (`rebrand.service.ts:85`, `reforge.service.ts:95`). Saving in the UI silently drops `maxRepairs`, `termPacks`, `analysisWindow`, `targetCompression`, `maxSpanSourceChapters`. Set those via API after any UI save. The Transform screen has no control for them at all (they appear in the web app only in `api-types.gen.ts`).
- D4 Chapter-mode reforge judge is blind to author instructions. `reforge-judge` says "a beat the AUTHOR INSTRUCTIONS declared removed is NOT missing", but `chapter-reforge.graph.ts:270-282` passes only `outline, worldNotes, glossarySlice, fidelityRule, writtenProse`, and the outline the judge scores against is built from a pack of world notes + glossary slice only (`:164-171` -> `context-assembler.service.ts:1122-1132`), so instructions never reach it either. Only `write` sees them. Predicted: any instruction that removes a beat yields `missing_beat` -> repair -> `attention`. Probe R-1 in recipe 2.7.
- D5 Analysis aborts when `windowsFailed > 0.1 * windows` (`reforge-analysis.service.ts:62,201`): with fewer than 10 windows a single failed window kills the whole analysis.
- D6 Import limits: a `final` import stores `novel.genre` in `projects.imported_meta` only when it matches a platform genre, and seeds one `source`-status volume per bundle volume carrying its title; a `source` import stores no volumes, and both cases come back as `warnings` on the response rather than being dropped silently. A `source` import always auto-recombines with `useAi: true` (`job.executor.ts:538-544` -> `recombine.service.ts:102-108`), so you cannot import a raw ladder and inspect it un-merged.
- D7 Transform enqueues target `reforge-${P}` (`reforge.controller.ts:188`), the same kind and target as chapter-mode start (`:67`), and `enqueue` dedupes onto any `pending|in_progress` row for that `(project, kind, target)` (`job.service.ts:58-67`); a running chapter-mode job makes `POST /reforge/transform` return that active job and discard the `{stage:'transform'}` payload.
- D8 Transform contract quirk: every output chapter of a span is rendered the span's whole `keptBeats` list as "the contract this chapter owes the reader" (`span-transform.graph.ts:89-101`, DTO says "Beats every output chapter of this span owes"), so a `keep`/`condense` span with N>1 outputs asks each output to cover all beats. Use one-chapter spans, or `merge`.
- D9 Skeleton logs `runId: 'skeleton'` (`planning/skeleton.service.ts:55`): no `workflow_runs` row, invisible on Workflow Runs; its `model_calls.run_id` is the literal string `skeleton`, shared by every project.
- D10 Doc/code: `novel-forge.md:122` states "Pipelines flag and continue per chapter" as an invariant, but that holds only for rebrand, reforge and translation — `runExtract` throws on the first failed chapter (`job.executor.ts:264`), and the comment introducing rebrand's behaviour calls flag-and-continue "a deliberate divergence from runGenerate/runExtract's throw" (`:312-314`). Either the invariant needs scoping or extract needs to stop throwing. Web Source Pipeline shows Consolidate "done" iff `planApproved` (`source.tsx:185`), unrelated to consolidation. `ExtractBody.rearm` is declared (`pipeline.dto.ts:17`) and read nowhere.

### 1. Sample manuscripts (original, written for these tests)

**S1 "The Azure Cloud Sect"**: 5 short chapters (translated-Chinese-web-novel voice). Planted on purpose:

- real-world residue: `Huaxia banner`, `Han Dynasty`, `Middle Kingdom`, `all of China`, `Chinese cultivators`, `Japanese sabre`, `Korean ginseng`; a stray CJK glyph `仙` (ch 3);
- nationalism beat (ch 2, Zhao Feng excludes "outsiders"); copy-edit plants: wrong speaker (ch 2 `said Zhao Feng`), misspelling `Lin Xaio` (ch 4);
- ch 4 near-duplicates ch 3 (repeated duel); ch 5 is a recap monologue with no dialogue and no new names (stall);
- cast for extraction: Lin Xiao (ch 1-5), Zhao Feng (2-5), Master Gu (1,2,5), Elder Bai (1,3 only), Stonebridge Town (2 only).
  `computeAnalysisSignals` run on S1 gives metrics `{chapterCount 5, medianWords 130, madWords 13, repetitionRatio 0.4, staticRatio 0.2, arcBoundaryCount 0, deadThreadCount 0}` and candidates `sig-1 repetition 3-4 (sev 2, conf 0.69)` and `sig-2 pacing_stall 5-5 (sev 2, conf 0.4)`; no `dropped_thread` is reachable at this size (needs a 40-chapter gap and 8 mentions). Chapter word counts are 143 / 130 / 115 / 92 / 132.
  Save as `s1.json`, import with `POST /api/v1/import` body `{"bundle": <s1.json>}` (validated: the bundle passes `ImportNovelBody` and `validateNovelBundle` with no issues, flattening to chapters 1-5):

```json
{
  "format": "novel-import",
  "schemaVersion": 1,
  "mode": "source",
  "novel": {
    "title": "The Azure Cloud Sect",
    "synopsis": "Lin Xiao, a servant boy at the Azure Cloud Sect, carries the two halves of his vanished father's sword. When a Jade Serpent Pill appears at his door, the sect leader's nephew Zhao Feng challenges him for it.",
    "tags": ["cultivation", "sample"]
  },
  "volumes": [
    {
      "ordinal": 1,
      "title": "Volume 1",
      "chapters": [
        {
          "title": "Chapter 1: The Broken Sword",
          "content": "Lin Xiao knelt in the mud outside the Azure Cloud Sect, clutching a sword snapped in two. Rain ran down the Huaxia banner above the gate, and the guards laughed at him.\n\n\"A servant boy with a Han Dynasty relic,\" said the taller guard. \"Go home.\" On the covered steps Master Gu watched and said nothing.\n\nThe blade had belonged to Lin Xiao's father, a wandering swordsman from the Middle Kingdom who vanished when the boy was six. Lin Xiao had carried the pieces for eight years.\n\nThat night Elder Bai brought a lantern to the woodshed. \"The sect takes no charity cases,\" he said, \"but a Jade Serpent Pill was left at your door this morning. Someone wants you alive.\"\n\nLin Xiao turned the green pill over in his fingers. Who in all of China would waste such a treasure on him?"
        },
        {
          "title": "Chapter 2: Zhao Feng's Challenge",
          "content": "By dawn the whole outer court knew about the pill. Zhao Feng, the sect leader's nephew, blocked Lin Xiao at the training yard.\n\n\"Chinese cultivators built this sect,\" he said, \"and outsiders like your father were never welcome. Give me the pill.\"\n\n\"It was left for me,\" said Zhao Feng.\n\nZhao Feng smiled. \"Then win it. Three days from now, at the Iron Kettle Inn in Stonebridge Town, where the sect settles its quarrels. Bring a sword, if you can find one.\"\n\nMaster Gu, passing by, remarked only that Korean ginseng tea was better with less honey, and walked on. Lin Xiao spent the day at the forge, gluing the halves of his father's blade with resin and iron filings. It would not hold. He knew it would not hold."
        },
        {
          "title": "Chapter 3: The Duel at the Iron Kettle Inn",
          "content": "The Iron Kettle Inn smelled of smoke and sour wine. Zhao Feng stood in the center of the room, his Japanese sabre gleaming.\n\n\"Last chance,\" he said. \"Kneel, and I break only one arm.\"\n\nLin Xiao drew the glued sword. It shattered on the first parry, and Zhao Feng's laughter filled the room.\n\nBut the last shard in Lin Xiao's hand glowed green, and when he swallowed the Jade Serpent Pill his qi surged into it. The shard cut Zhao Feng's sabre in half. Above the door, the character 仙 seemed to flicker.\n\n\"Immortal,\" Elder Bai whispered from the shadows. \"So the pill was meant for this.\" Zhao Feng fled into the rain, swearing revenge."
        },
        {
          "title": "Chapter 4: The Duel Again",
          "content": "The Iron Kettle Inn smelled of smoke and sour wine. Zhao Feng stood in the center of the room, his Japanese sabre gleaming.\n\n\"Last chance,\" he said. \"Kneel, and I break only one arm.\"\n\nLin Xiao drew a plain iron sword. It shattered on the first parry, and Zhao Feng's laughter filled the room.\n\nBut the last spark of the Jade Serpent Pill glowed green in Lin Xaio's blood, and his qi surged into the blade. The blade cut Zhao Feng's sabre in half.\n\nZhao Feng fled into the rain, swearing revenge."
        },
        {
          "title": "Chapter 5: Master Gu Remembers",
          "content": "Master Gu sat alone on the covered steps and thought about everything that had happened. He thought about the broken sword. He thought about the Jade Serpent Pill.\n\nHe thought about the first duel at the Iron Kettle Inn and the second duel at the Iron Kettle Inn, which had gone almost the same way as the first. He thought about the father of Lin Xiao, and about Zhao Feng, and about Elder Bai, and about the pill again.\n\nHe thought about the Azure Cloud Sect and how much had changed in a week and how little had truly changed. Rain fell on the banner. He thought about the sword once more, and then about the pill once more, and then about the two duels once more, until the lantern burned down."
        }
      ]
    }
  ]
}
```

**S2 recombine ladder** (9 short chapters; passes `ImportNovelBody` and `validateNovelBundle`). `buildGroupingPlan` run on these titles gives `before 9, after 7` with ambiguous boundaries `[{afterNumber:5,reason:'bare_repeat'},{afterNumber:7,reason:'bare_repeat'},{afterNumber:8,reason:'untitled_short'}]`. Expected after AI: merge 5 (sentence continues mid-word-run), split 7 (time skip "Three winters later"), merge 8 (sentence continues) => 5 chapters; `applyBoundaryMerges(plan,[5,8])` was run and produces exactly that.

```json
{
  "format": "novel-import",
  "schemaVersion": 1,
  "mode": "source",
  "novel": {
    "title": "Recombine Ladder Sample",
    "synopsis": "Nine short scraped chapters that exercise every rung of the recombine title-parsing ladder."
  },
  "volumes": [
    {
      "ordinal": 1,
      "chapters": [
        {
          "title": "Chapter 1: Ash Gate (1/2)",
          "content": "The ash gate stood at the edge of the burned quarter, and no one in Corrin's family had passed through it in three generations. Corrin brought a candle anyway, because her grandmother had said the gate opened only for those who arrived with a light."
        },
        {
          "title": "Chapter 1: Ash Gate (2/2)",
          "content": "Beyond the gate the ground was warm. Corrin walked until the candle guttered, and then she kept walking, because turning back would have meant admitting the fear."
        },
        {
          "title": "Chapter 2: The Salt Road - Part 1",
          "content": "The salt road ran white under the moon. Bram loaded the last cart and checked the axle twice, as his father had taught him, before he let himself think about the toll-keeper."
        },
        {
          "title": "Chapter 2: The Salt Road - Part 2",
          "content": "The toll-keeper was asleep, or pretending to be. Bram passed him at a walk, counted to two hundred, and only then let the mule run."
        },
        {
          "title": "The Lantern Fair",
          "content": "The Lantern Fair filled the square by dusk, and Mira pushed through the crowd with her mother's brass lantern held high, trying to reach the stage before the judges lit the first flame, and just as she lifted the lantern toward the"
        },
        {
          "title": "The Lantern Fair",
          "content": "crowd, the paper flame caught, and the whole square gasped at the color of it. Mira did not lower the lantern until the judges had all stood."
        },
        {
          "title": "The Cold Well",
          "content": "Night fell over the village and the well froze. The elders agreed at last to seal it, and the story of the cold well ended there. THE END OF THE FIRST BOOK."
        },
        {
          "title": "The Cold Well",
          "content": "Three winters later, a stranger arrived in the village asking about a well. No one could remember one, and the stranger, unaccountably, did not seem surprised, and he asked whether anyone in the village still kept a"
        },
        {
          "title": "Chapter 5",
          "content": "key, because a well like that always had one. The innkeeper said she might have one somewhere, and went to look."
        }
      ]
    }
  ]
}
```

**S3 translation originals** (`originalLanguage: "zh"`; each `{title, content}` passes `OriginalChapterBody`). Probes: glossary terms (沈砚, 老柯, 雾港, 无火灯, 夜灯会, 灯正), honorific `沈师兄`, digit runs `12` and `300` (number-drift scan), 8/10/6 quote marks in chapters 1/2/3 (dialogue-drift arms at >= 4, `fidelity-scan.ts:21`), 5/4/5 paragraphs (zh paragraph-drift band 0.6-1.6, length band 1.2-3.2, `script-profile.ts` `ZH_PROFILE`), hanzi numerals `三百年 / 三百枚 / 三条` (see the false-positive probe in recipe 2.9). For each item, `chapter` goes in the URL of `PUT /api/v1/projects/:T/translation/originals/:chapter` and `{title, content}` is the body:

```json
[
  {
    "chapter": 1,
    "title": "第一章 无火之灯",
    "content": "雾港的雨下了七天七夜。沈砚蹲在修灯铺的门槛上，看着街对面那盏不肯熄灭的灯。\n\n那盏灯没有火，也没有油。老柯说它叫“无火灯”，是夜灯会三百年前留下的东西，谁也不知道它靠什么亮着。\n\n“别看了。”老柯端着一碗冷茶从里屋走出来，“看久了，它会认得你。”\n\n沈砚没有回答。他数过，这盏灯今夜比昨夜亮了三分，而他口袋里只剩下12枚铜钱。\n\n“认得我，也比饿死强。”他低声说。"
  },
  {
    "chapter": 2,
    "title": "第二章 夜灯会的来客",
    "content": "第七天傍晚，一个撑黑伞的女人推开了修灯铺的门。她自称是夜灯会的灯正，姓林。\n\n“沈师兄，”她竟然这样称呼沈砚，“会里有人说，你能看见无火灯的影子。”\n\n沈砚愣了一下：“我只是个修灯的。”\n\n林灯正把一枚铜牌放在柜台上，上面刻着300这个数字。“这是你师父当年欠会里的债，”她说，“三百枚里，他只还了一半。”"
  },
  {
    "chapter": 3,
    "title": "第三章 灯正的规矩",
    "content": "林灯正说，夜灯会有三条规矩：不问灯的来历，不碰灯的芯，不在雨夜点灯。\n\n沈砚数了数，昨夜他三条全犯了。\n\n“那我会被赶出雾港吗？”他问。\n\n“不会，”林灯正合上黑伞，“会被带走。无火灯选中的人，从来没有第二条路。”\n\n老柯在里屋摔碎了茶碗。"
  }
]
```

**S4 finished English novel** (2 chapters; passes `ImportNovelBody` and `validateNovelBundle`). `final`-mode import bundle:

```json
{
  "format": "novel-import",
  "schemaVersion": 1,
  "mode": "final",
  "novel": {
    "title": "Final Sample",
    "synopsis": "A finished English novel pushed by a curation bot, chapter by chapter.",
    "tags": ["sample"]
  },
  "volumes": [
    {
      "ordinal": 1,
      "title": "Volume 1",
      "chapters": [
        {
          "title": "The First Tide",
          "content": "Mira climbed the spiral stair for what she told herself was the last time.\n\nThe lamp room was cold."
        },
        {
          "title": "A Voice in the Foam",
          "content": "The voice came again with the seventh wave, the way it always did."
        }
      ]
    }
  ]
}
```

Curated-ingest bodies (`PUT /api/v1/ingest/novels/test:001` gets `novel`; `PUT .../chapters/1` and `.../2` get the chapter objects). Both shapes were validated against `IngestNovelBody` and `IngestChapterBody`:

```json
{
  "novel": {
    "title": "Curated Ingest Sample",
    "synopsis": "A finished English novel pushed by a curation bot, chapter by chapter.",
    "originalAuthor": "Sample Author"
  },
  "chapters": [
    {
      "title": "The First Tide",
      "content": "Mira climbed the spiral stair for what she told herself was the last time.\n\nThe lamp room was cold."
    },
    {
      "title": "A Voice in the Foam",
      "content": "The voice came again with the seventh wave, the way it always did."
    }
  ]
}
```

### 2. Recipes

#### 2.1 Novel import (`source` and `final` modes)

- **Entry:** UI screen **Import novel** at `/import` (`.json` file upload + "Import novel" button). It is not in the sidebar: reach it from the Projects home header button "Import novel" (`routes/_app/index.tsx:137`) or the Source Pipeline empty state (`source.tsx:228`). API `POST /api/v1/import` (202 `{projectId, jobId}`, route body limit 64 MB against the app-wide 12 MB). Creates the project; not nested under `/projects/:id`.
- **Preconditions:** none. Project cap (`PRJ_004`, 409) applies.
- **Which parts are AI:** none in `final`. In `source` the only AI is the auto-recombine at the end (`job.executor.ts:538-544`) and only when the title ladder leaves an ambiguous boundary. S1 has none (every title carries a distinct `Chapter N:` prefix), so a clean S1 import must make zero model calls.
- **Input:** S1 as `source`; for `final` use the S4 final bundle.
- **Run:** 1. POST S1. 2. Poll the job (`phase` inserting -> recombining). 3. `GET /api/v1/projects/:P/source/chapters`. 4. Repeat with the `final` bundle. 5. Negative bodies: two volumes with `ordinal 1`; ordinals `1,3`; a whitespace-only `content`; `novel.cover` naming a missing asset.
- **Verify:** `projects`: `kind` `source` (final: `new_novel` plus one contentless `<section>/default` `bible_documents` row per `bible_section` enum value), `name=title=novel.title`, `brief=synopsis`, `themes=tags`. `chapters`: 5 rows numbered 1..5 in flatten order, `status='done'`; source: `generator='standard', locked=false`; final: `generator='human', locked=true`; `word_count` set; `仙` and blank-line paragraphs intact (compare bytes with the bundle; only markdown sanitising may differ). `jobs` row `kind='import'`, `target='import-P'`, `payload` compacted to `{chapters:5,hasCover:false}` once the job completes or is cancelled (`job.executor.ts:555-561`) — a **failed** import never reaches the compaction, so the full bundle prose stays on the row. Invariant: `select count(*) from model_calls where project_id=P` is 0 for S1 and for any `final` import. Negatives return 400 with field paths `volumes` / `novel.cover` / `volumes[0].chapters[0].content` (the whitespace-only body clears the DTO's `minLength: 1` and is caught by `validateNovelBundle`, not AJV).
- **Quality check:** none (deterministic). Only check that `volumes[].title` is dropped (D6) is what you expect.
- **Fails when:** 400 `ValidationError` field errors; `PRJ_004`; job `failed` mid-batch leaves the project with partial chapters (`jobs.last_error`); a `413` past the route's 64 MB, or a 400 on field `bundle` past the validator's own 48 MB content ceiling.

#### 2.2 Source extraction

- **Entry:** UI **Source Pipeline** (`/novels/$novelId/source`, four stages: Extract, Consolidate, Assets, Skeleton) stage "Extract" -> "Run", which posts an empty body `{}`, so the server default `limit` of 5 chapters applies per press (`pipeline.controller.ts:39`, `extraction.service.ts:9`); `POST /api/v1/projects/:P/extract` `{"limit"?}` (202, job `extract`, target `extract-P`). `source` or `new_novel` project. Targets: `chapters.status='done' and summary is null`. The controller comment calls this a backfill tool for legacy novels; there is no other caller of `runSourceExtraction`, so it is in practice the only way chapters get extracted.
- **Preconditions:** S1 imported (recipe 2.1). Ollama up for the embedding step (`qwen3-embedding:8b`); embedding failure is non-fatal.
- **Input:** S1 chapters 1-5. **[AI]** 1 call per chapter: graph `source-extraction` (`loadChapter, extractKnowledge, persistKnowledge, embedProse, finish`), prompt `extraction@1.0.0`, role `extraction`, cacheable.
- **Run:** 1. `POST /extract {}`. 2. Poll the job. 3. Inspect `workflow_runs.error` and rows below. 4. Re-run `POST /extract {}` (must pick 0 chapters).
- **Verify (D1 present):** run `failed` with `Missing value for input variable contextPack`, job `failed` with `chapter 1 extraction failed (run <runId>)`, 0 `model_calls`. **Verify (after fix):** `chapters.summary` non-null for 1-5; `entities` (origin `extracted`, snake_case keys) contain lin_xiao, zhao_feng, master_gu, elder_bai, no duplicate person (`xiao_lin`); `entity_appearances` counts per entity (Lin Xiao >= 3 distinct chapters; the prompt asks for "new or updated" entities, so appearances undercount unless the model re-lists them); `beats` with `chapter` in 1..5; `plot_threads` (the duel/revenge, open); `mysteries` (who left the pill: open, not resolved); `world_facts`; `entity_relationships`; `chapter_chunks` rows. Invariants: every `beats.entities` key exists in `entities`; nothing references chapter 6; a second `POST /extract` enqueues an empty target list.
- **Quality check:** each summary is 2-3 sentences and states what changed and what stays open; ch 5 summary must admit that nothing happens (no invented event); ch 1 summary must not leak ch 3's pill payoff; `Elder Bai` is minor (2 chapters).
- **Fails when:** D1; `AI_001` unparseable after the repair ladder (`model_calls.status`, warn "Attempt 1 parse failed"); `AI_008/AI_009` quota; embedding warn `embedProse: addProse failed (non-fatal)`.
- **Cost:** 5 calls, ~1-2k tokens in each.

#### 2.3 Consolidation (deterministic, not AI)

- **Entry:** Source Pipeline "Consolidate" -> "Run"; `POST /api/v1/projects/:P/consolidate` (200, sync `{significanceUpdated, relationshipsPromoted}`).
- **Preconditions:** `entity_appearances` rows (extraction). With D1 open there are none, so seed by SQL. The only NOT NULL `entities` columns without a default are `project_id`, `entity_key`, `type` and `name`, so this insert is complete; `entity_appearances` needs `(entity_id, project_id, chapter)`:
  `insert into entities(project_id,entity_key,type,name,origin,status) values (P,'lin_xiao','character','Lin Xiao','extracted','active'),(P,'elder_bai','character','Elder Bai','extracted','active');`
  `insert into entity_appearances(entity_id,project_id,chapter) select e.id,P,c from entities e, generate_series(1,3) c where e.project_id=P and e.entity_key='lin_xiao';` and the same for `elder_bai` with `chapter in (1,3)`.
- **Run:** 1. POST. 2. POST again. 3. Change Lin Xiao to exactly 2 chapters (delete one appearance) and POST.
- **Verify:** `significanceUpdated=2` (it counts every entity that has appearances, not only those whose value changed); `entities.significance`: lin_xiao `major` (3 distinct chapters), elder_bai `minor`; drops to `minor` at 2 chapters (threshold is `>= 3`, `consolidate.service.ts:12,39`); repeat call gives identical counts; `model_calls` unchanged; `relationshipsPromoted` is always 0 (D2). UI chip: the Consolidate stage reads "done" only after a plan is approved (D10), so trust the response, not the chip.
- **Quality check:** none.
- **Fails when:** counts 0/0 because no appearances exist (D1); `IAM_002` 403 for a bot without `novel-forge:projects:read` + `novel-forge:projects:write` (this endpoint does not need `generation:run`).

#### 2.4 Skeleton

- **Entry:** Source Pipeline "Skeleton" -> "Run"; `POST /api/v1/projects/:P/skeleton` (200 sync). Not guarded by project kind.
- **Preconditions:** S1 imported; ideally extraction summaries (else the prompt only sees the synopsis).
- **Input:** project `brief`+`premise`, up to 50 entities, chapter summaries, `themes`. **[AI]** 1 call, `skeleton@1.0.0`, role `skeleton` (planning group), never cached. Writes `projects.skeleton_character_arcs` (jsonb) and `skeleton_power_curve` (text), overwriting.
- **Run:** 1. POST. 2. `select skeleton_character_arcs, skeleton_power_curve from projects where id=P`. 3. `select * from model_calls where run_id='skeleton' and project_id=P` (D9: not in Workflow Runs).
- **Verify:** response has `characterArcs` (object keyed by model-chosen ids) and `powerCurve` (string); columns match the response; one `model_calls` row `prompt_key='skeleton', prompt_version='1.0.0'`.
- **Quality check:** arcs for Lin Xiao, Zhao Feng and Master Gu each state start state, the events that change them and end state, using S1's own events (broken sword, pill, shard cutting the sabre), and the power curve names escalation points and setbacks tied to those events. Generic cultivation boilerplate or invented characters = harness value is nil here. Run once with D1 (no summaries) and once with summaries seeded to see what context adds.
- **Fails when:** `AI_001`; empty `characterArcs`; arcs about people not in S1.

#### 2.5 Recombine (title-parsing ladder + AI boundary resolution)

- **Entry:** `POST /api/v1/projects/:P/recombine` `{"dryRun"?, "useAi"?}` (200 sync; `source` only, else `PRJ_003`). No UI screen (recombine appears in the web app only in `api-types.gen.ts`); it also runs inside import(source), rebrand, chapter-reforge and analysis jobs via `autoRecombine`, which always passes `useAi: true` and swallows errors (log `autoRecombine skipped`).
- **Preconditions:** none, but it refuses once derived data exists (summary, appearances, beats, chunks, briefs, conversions, reforges, translations, drafts) with `SRC_003`.
- **Input:** S2. **[det]** ladder (`title-parts.ts`): `(1/2)` part-of-total, `- Part 2`, `Chapter N:` prefix, bare repeat, untitled-short. **[AI]** only for the 3 ambiguous boundaries: 1 call, `recombine@1.0.0`, role `skeleton`, graph `recombine`/target `boundaries`, never cached.
- **Run:** 1. Import S2 (D6: merge is applied by the import job). 2. `GET /api/v1/projects/:P/source/chapters`. 3. `POST /recombine {"dryRun":true}` (no AI). 4. `POST /recombine {"dryRun":true,"useAi":true}` for a second opinion. 5. Run extraction (or set any `chapters.summary`), then `POST /recombine {}` again.
- **Verify:** 5 chapters after import **if the model merges 5 and 8**: titles `Ash Gate`, `The Salt Road`, `The Lantern Fair`, `The Cold Well`, `The Cold Well` (the deterministic ladder alone stops at 7, and every merge beyond that is the model's); ch 1 `merged_from = [{number:1,title:"Chapter 1: Ash Gate (1/2)",words:45},{number:2,...}]` (`recombine.service.ts:217`); content = parts joined by `\n\n` (`:216`, so the mid-sentence cut in "toward the / crowd" stays as a paragraph break, a visible seam); numbers contiguous 1..5. `model_calls`: exactly 1 row `recombine@1.0.0`; `raw_output` is `{"decisions":[{"afterChapter":5,"verdict":"merge"},{"afterChapter":7,...},{"afterChapter":8,...}]}` in pre-renumber numbers. Step 3 returns `applied:false, before:5, after:5` with `ambiguous=[{afterNumber:4,reason:'bare_repeat'}]` (the boundary the AI left split, renumbered); step 4 may report `after:4` without applying it. Step 5 returns 400 `SRC_003`. A clean S1 import must produce no `recombine` call.
- **Quality check:** merge 5 and 8 (a sentence runs across the cut), split 7 (scene end + "Three winters later"). A merge on 7 is a false merge: the prompt says "when in doubt, answer split", and short halves bias it the wrong way.
- **Fails when:** verdicts for boundaries not asked are ignored (invariant: the model only joins, never splits); AI failure silently falls back to the deterministic plan (warn `AI boundary resolution failed`), leaving 7 chapters; `SRC_002` on an empty project.
- **Cost:** 1 call, ~600 tokens.

#### 2.6 Rebrand (glossary seed, convert, residue scan, audit, repair, flag-and-continue)

- **Entry:** UI **Rebrand** (`/novels/$novelId/rebrand`, source projects only — a non-source project is redirected to the overview): cards "Conversion directives" ("Additional scenes (optional)", "Extra banned terms", "AI audit every chapter", "Save config") and "Pipeline", "Start rebrand" (reads "Running…" while a job is active), a chapter row whose "Read" action opens the drawer (Converted / Original) alongside "Convert"/"Re-run", and "Download manuscript". API: `PUT /api/v1/projects/:P/rebrand/config` (200), `POST /rebrand {"force"?,"limit"?}` (202), `GET /rebrand`, `/rebrand/glossary`, `/rebrand/chapters`, `/rebrand/chapters/:chapter`, `POST /rebrand/chapters/:chapter` (202, single re-run, forces), `GET /rebrand/manuscript`.
- **Preconditions:** S1 source project. Extraction not required (the seed pack then has no entities/world facts, see D1).
- **Input:** S1. Config for the happy path: `PUT /rebrand/config {"settings":{"auditEnabled":true,"maxRepairs":1,"termPacks":["east-asian"],"bannedExtra":[]}}` (API only, D3).
- **Run (6a happy path):** 1. `POST /rebrand {}`. 2. Watch phases recombining -> glossary -> converting. 3. Verify. **(6b forced repair, cheap):** `PUT /rebrand/config {"settings":{"bannedExtra":["the"],"maxRepairs":1}}` then `POST /rebrand/chapters/2`; then `maxRepairs:0` and re-run (no repair), then `maxRepairs:2`. Restore `bannedExtra:[]`. **(6c flag-and-continue):** import S1 plus a 6th chapter `{"title":"Chapter 6: The Bell","content":"The bell rang twice. Nobody answered."}`; the convert schema's `body` has `minLength: 100` (`ai/schemas/rebrand.schema.ts:69`), so the model must pad a 37-character chapter or the run fails — and rebrand is the pipeline that genuinely flags and continues (`job.executor.ts:312-314`).
- **Verify (6a):** `rebrands.status='done'`, `world_notes` >= 200 chars (the schema's own floor, `rebrand.schema.ts:27`) naming an invented replacement for every real reference in S1 (China/Middle Kingdom/Huaxia, Japan, Korea) and reusing none. `rebrand_glossary`: seeded rows `created_chapter=0` for Lin Xiao, Zhao Feng, Master Gu, Elder Bai, Azure Cloud Sect, Jade Serpent Pill, Iron Kettle Inn, Stonebridge Town plus `country`/`culture` entries; later rows `created_chapter>=1`; the glossary only grows and no `replacement` ever changes between runs. `chapter_conversions`: 5 rows, `status` `converted|attention`, `issues` null when `converted`, `revision=1`, `title` converted. Leak invariant (must be empty): `select chapter from chapter_conversions where project_id=P and status='converted' and (body ~* '(china|chinese|huaxia|han dynasty|middle kingdom|japan|korea|lin xiao|zhao feng|azure cloud|iron kettle)' or body ~ '仙');` (a `converted` row is by definition scan-clean, so any hit is a scan bug). Calls: 1x `rebrand-glossary@1.0.0` (role `rebrand`), then per chapter `rebrand-convert@1.1.0` (role `rebrand`, node `convert`) + `rebrand-audit@1.0.0` (role `audit`): 11 calls. `workflow_runs.node_trace` happy = `[loadChapter, assembleContext, convert, residueScan, audit, persistConversion, mergeGlossary, finish]`. Chapter >= 2 packs (`/runs/:id/context`): `world_notes` (stable), `glossary_slice`, and `prev_ending` taken from the previous CONVERTED body (must show invented names, not Lin Xiao). `cached_input_tokens > 0` from ch 2 on if the provider reports caching. Re-`POST /rebrand {}` converts nothing new and never re-seeds (`world_notes` set). No endpoint clears `world_notes` — `PUT /rebrand/config` writes only `directives` and `settings` — so forcing a fresh seed means nulling the column by SQL.
- **Verify (6b):** ch 2 ends `attention`, `issues=[{source:'residue',type:'banned_term',detail:'real-world term "the" must not appear',...}]`; `node_trace` gains `prepareRepair, convert, residueScan, audit` once (twice with `maxRepairs:2`, none with `0`); `model_calls.node` shows `convert, audit, repair, audit`; the repair call's prompt carries `Repair notes: 1. [banned_term] ...`. **(6c):** row `status='failed', body=''`, `issues=[{source:'run',type:'run_failed'}]`, other chapters unaffected, `GET /rebrand/manuscript` lists `failedChapters:[6]` with a `<!-- WARNING -->` banner, UI chip "1 failed".
- **Quality check:** all 5 beats per chapter survive (ch 1: broken sword mocked, father vanished, pill left, Elder Bai's warning; ch 2: Zhao Feng demands the pill and names the inn; ch 3: shard cuts sabre; ch 4 repeat kept as is; ch 5 recap). The ch 2 nationalism beat is rewritten as an in-world faction contempt, not deleted and not left as national language. Same replacement for Lin Xiao and "the father of Lin Xiao" in every chapter. Light copy-edit: word count within +/-15% of source, `fixes` lists exactly the two plants (wrong speaker ch 2, `Lin Xaio` ch 4) and nothing invented. `仙` re-rendered, not kept.
- **Fails when:** `RBR_003` (non-source); job `failed` "Rebrand glossary is not seeded" (`worldNotes` empty because the seed call failed); `AI_001`; many `attention` rows with `source:'audit'` issues about style (the audit is told to ignore style, so that is a prompt failure); UI Save config wiped `maxRepairs` (D3).
- **Cost:** 11 calls for S1; 6b costs 4 calls per run.

#### 2.7 Reforge, chapter mode

- **Entry:** UI **Reforge** (`/novels/$novelId/reforge`): "Re-authoring instructions" card ("Author instructions (optional)", "Fidelity" Preserve/Close/Loose, "Target words per chapter (optional)", "AI fidelity judge every chapter", "Save config"), "Start reforge", a chapter row whose "Read" action opens the drawer (Reforged / Source) alongside "Reforge"/"Re-run". API: `PUT /api/v1/projects/:P/reforge/config` (200), `POST /reforge` (202), `GET /reforge`, `/reforge/chapters[/:chapter]`, `POST /reforge/chapters/:chapter` (202), `GET /reforge/manuscript`. Source projects only (`REF_003`).
- **Preconditions:** fresh S1 project. If rebrand already ran, its `world_notes`, glossary, `bannedExtra` and `termPacks` are reused (no second seed call); otherwise the job seeds them with 1 extra call.
- **Input:** S1 with `PUT /reforge/config {"mode":"chapter","fidelity":"close","instructions":"Tighten the prose; keep every named beat.","settings":{"judgeEnabled":true,"maxRepairs":1,"targetWords":120}}`.
- **Run:** 1. `POST /reforge {}`. 2. Verify. 3. Fidelity sweep on one chapter: set `preserve`, `close`, `loose`, each `POST /reforge/chapters/3`. 4. Probe R-1: `PUT /reforge/config {"instructions":"Delete the ending of chapter 3 where Zhao Feng flees swearing revenge."}` then `POST /reforge/chapters/3`.
- **Verify:** per chapter graph nodes `loadChapter, outlineContext, generateOutline, writeContext, write, residueScan, judge, persistReforge, mergeGlossary, finish` (+ `prepareRepair, write` on a dirty pass, up to `maxRepairs`); calls `reforge-outline` (role `reforge`), `reforge-write` (role `reforge`), `reforge-judge@1.1.0` (role `judge`) = 3 per chapter (+2 per repair, +1 seed): 16 for S1. `chapter_reforges`: 5 rows `reforged|attention`, `source_beats` (outline: 4-6 beats with purpose, entities, dialogue anchors), `fidelity` `{verdict, coveredBeats, totalBeats, missingBeats}`, `word_count`, `issues`. Invariant: `reforged` implies `coveredBeats = totalBeats` and no residue hit; `attention` rows keep their body. At `loose` the judge is told reordering is fine (`renderReforgeFidelityRule`); at `preserve|close` a reorder should be flagged.
- **Quality check:** same plot, characters and dialogue meaning as S1, with better prose (compare ch 4's flat sentences); no invented beat; renames follow the glossary; `changes` lists real removals only; ch 3 at `loose` may compress, at `preserve` should be close in length.
- **Probe R-1 result (predicted, D4):** ch 3 `attention` with `issues=[{source:'fidelity',type:'missing_beat',...}]` for the removed ending even though the author asked for it. If the judge passes it, note that as luck, not design.
- **Fails when:** `REF_003`; `Rename bible is not seeded` in a run error; `glossary_leftover` residue flags; D3 (UI Save wiped `maxRepairs`).

#### 2.8 Reforge, transform mode (analysis, plan approval, N:M write, cut ledger, promote)

- **Entry:** UI **Transform** (`/novels/$novelId/transform`). While the project is in chapter mode the screen shows only a "This project is in chapter mode" card with a "Switch to transform mode" button; the tabs **Analysis** ("Run analysis" / "Re-run analysis"), **Plan** ("Draft plan" / "Re-draft from analysis", "Save as new revision", "Approve plan"), **Transform** ("Start transform" plus an "Output limit" input), **Cuts** and **Promote** ("Promote") appear only once `reforge.mode === 'transform'`. API under `/api/v1/projects/:P/reforge`: `PUT /config`, `POST /analyze`, `GET /analysis[/report|/findings]`, `POST /plan`, `GET /plan`, `PUT /plan/spans`, `POST /plan/approve`, `POST /transform`, `GET /outputs[/:outputChapter]`, `POST /outputs/:outputChapter`, `GET /cuts`, `POST /promote`, `GET /manuscript` (the `POST`s return 202, the rest 200; `POST /promote` needs `projects:write` but not `generation:run`).
- **Preconditions:** fresh S1 project (5 chapters). Config (API only): `PUT /reforge/config {"mode":"transform","settings":{"analysisWindow":2,"maxSpanSourceChapters":6,"targetCompression":0.6}}`; mode `transform` forces `fidelity:'loose'` (sending another value gives `REF_008`).
- **T1 Analysis [AI]:** `POST /reforge/analyze` -> 3 windows (1-2, 3-4, 5) then synthesis: 3x `reforge-analyze-window@1.0.0` + 1x `reforge-synthesize@1.0.0` (role `extraction`, planning group, cacheable). Verify `reforge_analyses`: `status='done'`, `windows_failed=0`, `chapters_analyzed=5`, `metrics.repetitionRatio=0.4`; `reforge_chapter_cards` 5 rows with `movement` (expect ch 1-3 `advances`, ch 4 `sidesteps|stalls`, ch 5 `stalls`); `reforge_findings` includes `repetition 3-4` and `pacing_stall 5-5` (the two candidates `computeAnalysisSignals` produces on S1) with `detected_by` `both` when the model cites the `signalRef`, else `signal`. `GET /analysis/report` names the chapters and says ch 4 repeats ch 3 and ch 5 is recap; it must not discuss prose quality; window 2's cards must not re-introduce the pill as new (carry state works). D5: any failed window aborts.
- **T2 Plan draft [AI]:** `POST /reforge/plan` -> 1 call `reforge-plan@1.0.0` (role `plan`), status `draft` (never auto-approved). Judge the model's own plan: spans cover chapters 1-5 exactly once, ch 4 dropped or condensed, `keptBeats` concrete, `continuityNotes` present after any drop, `findingIds` cite the two findings. `REF_006` = an invalid plan (job fails; the plan brief states the chapter count).
- **T3 Deterministic plan (removes model variance):** `PUT /reforge/plan/spans` with the body below (`baseRevision` = the drafted revision). Expect `revision` +1, previous plan `superseded`. Negatives: a gap (`toChapter:1` on span 1) -> 400 `REF_006`; stale `baseRevision` -> 409 `REF_010`.
  The body below passes `ReforgePlanSpansBody` and `validateTransformPlan(spans,{chapterCount:5})` returns no errors; `deriveOutputNumbering` gives `outputChapterCount: 3` with span 1 -> output 1, span 2 -> output 2, span 3 (drop) -> none, span 4 -> output 3. With `toChapter:1` on span 1 the validator returns `spans must partition the source: span 2 starts at 3, but span 1 ends at 1`.

```json
{
  "baseRevision": 1,
  "spans": [
    {
      "ordinal": 1,
      "fromChapter": 1,
      "toChapter": 2,
      "action": "merge",
      "targetChapters": 1,
      "arcLabel": "Broken Sword",
      "rationale": "Chapters 1 and 2 are setup that reads better as one opening.",
      "keptBeats": [
        "Lin Xiao kneels at the sect gate holding his father's broken sword and is mocked by the guards",
        "An unknown benefactor leaves a Jade Serpent Pill at his door and Elder Bai warns him someone wants him alive",
        "Zhao Feng demands the pill and challenges Lin Xiao to a duel at the Iron Kettle Inn in three days"
      ],
      "cutThreads": []
    },
    {
      "ordinal": 2,
      "fromChapter": 3,
      "toChapter": 3,
      "action": "keep",
      "targetChapters": 1,
      "arcLabel": "Broken Sword",
      "rationale": "The first duel is the payoff of the opening and stays intact.",
      "keptBeats": [
        "The glued sword shatters on the first parry",
        "Lin Xiao swallows the Jade Serpent Pill and the shard cuts Zhao Feng's sabre in half",
        "Elder Bai says the pill was meant for this and Zhao Feng flees swearing revenge"
      ],
      "cutThreads": []
    },
    {
      "ordinal": 3,
      "fromChapter": 4,
      "toChapter": 4,
      "action": "drop",
      "targetChapters": 0,
      "arcLabel": "Duel Rematch",
      "rationale": "A near-verbatim repeat of the first duel that adds nothing.",
      "keptBeats": [],
      "cutThreads": ["Iron Kettle Inn"]
    },
    {
      "ordinal": 4,
      "fromChapter": 5,
      "toChapter": 5,
      "action": "keep",
      "targetChapters": 1,
      "arcLabel": "Aftermath",
      "rationale": "The reflective close is kept but cannot lean on the cut rematch.",
      "keptBeats": ["Master Gu sits alone and weighs the broken sword, the pill and Zhao Feng's revenge", "The lantern burns down as the sect settles into an uneasy week"],
      "cutThreads": [],
      "continuityNotes": "Zhao Feng has been beaten once and is gone; Lin Xiao holds the pill's power; nobody speaks of the inn again."
    }
  ]
}
```

- **T4 Approve [det]:** `POST /reforge/plan/approve {"baseRevision":<rev>}` -> `reforge_plans.status='approved'`, `output_chapter_count=3`; `GET /reforge/cuts` shows 2 seeded rows: `duel-rematch` (kind `arc`, disposition `cut`) and `iron-kettle-inn` (kind `subplot`, `cut`), both `effective_from_output=3`; `reforge_plan_spans.bridge_directive` set on span 4 ("The source chapters 4-4 (Duel Rematch) are cut. The reader never saw them ..."), built without a model call. Approving twice is a no-op; editing after approval writes a new draft revision (approved plans are never mutated); `POST /transform` before approval -> `REF_005`.
- **T5 Write [AI]:** `POST /reforge/transform {}` (target `reforge-P`, D7). Seeds the rename bible first if absent (1 call), then per output the `span-transform` graph: `loadSpan, transformContext, write, residueScan, cutScan, judge, (prepareRepair, write), persistOutput, mergeGlossary, appendCuts, finish`; prompts `reforge-transform-write@1.0.0` (role `reforge`) and `reforge-transform-judge@1.0.0` (role `judge`); max 1 repair, hard-coded in `routeAfterTransformJudge` (`span-transform.graph.ts:82`), `settings.maxRepairs` is ignored. 1 + 3x2 (+2 per repair) = 7+ calls. Verify `reforge_outputs`: 3 rows (outputs 1..3 = spans 1,2,4; output 1 has `from_chapter=1,to_chapter=2`, i.e. 2:1), `status written|attention`, `plan_beats` = the span's `keptBeats`, `fidelity.coveredBeats = totalBeats`, `word_count` well under the source span (this is condensation).
- **Cut ledger checks:** output 3 must not contain `Iron Kettle Inn` or `Duel Rematch` (`select body ilike '%iron kettle%' from reforge_outputs where output_chapter=3` = false when `written`); S1 ch 5 names the inn twice, so this is the pressure test. A literal hit becomes `issues=[{source:'cut',type:'resurfaced_cut',cutKey:'iron-kettle-inn'}]`, one repair, else `attention`. Outputs 1-2 may name the inn (ban starts at 3). `cutDelta` entries the writer reports are appended with `effective_from_output = n+1`; re-running `POST /reforge/outputs/3` never rewrites existing ledger rows (append-only, `onConflictDoNothing`). Quality: output 3 opens across the seam ("Zhao Feng is gone", time passed) without recapping the rematch; kept beats all land; no Elder Bai / inn callbacks.
- **T6 Promote [det]:** before all outputs exist -> 400 `REF_009` (`written`/`expected` counts). Then `POST /reforge/promote {"title":"Azure Ash (transformed)","seedVolumes":true}` -> new `projects` row `kind='curated'`, `source_project_id=P`; `chapters` 3 rows `locked=true, generator='human', status='done'` with the output bodies; `volumes` 2 rows from `arcLabel` runs (`vol-1` "Broken Sword" 1-2, `vol-2` "Aftermath" 3-3, dropped span skipped); `reforge_plans.promoted_project_id` set; a second promote returns `alreadyPromoted` and creates no second project. No `model_calls` for promote. `GET /reforge/manuscript` renders the 3 outputs.
- **Fails when:** `windows_failed` abort (D5); `REF_006`; `Rename bible is not seeded` (`loadSpan`); outputs stuck `attention` with `missing_kept_beat` because a span kept beats the output cannot hold (D8); UI Save config wiped analysis settings (D3).
- **Cost:** analysis 4 calls, plan 1, transform 7+, roughly 15 calls; promote 0.

#### 2.9 Translation (paste + bot ingest, glossary lifecycle, translate, fidelity checks, finalize)

- **Entry:** UI **Translation** (`/novels/$novelId/translation`): "Add chapter" (paste original), primary button "Start translation" -> "Continue translating" -> "Translate remaining", segmented tabs **Chapters** / **Terminology** (sub-views "Review queue · N", "Glossary · N", "Not terms · N", "Approve these N", "Add term"), per-chapter "Translate"/"Re-run", "Finalize", "Reopen", Original / English / Side by side view; "Setup" card ("Style notes", "Fidelity audit per chapter", "Pause after seeding", "Honorifics", "Segment size"). API under `/api/v1/projects/:T/translation`: `PUT /config`, `PUT|GET|DELETE /originals/:chapter`, `GET /chapters[/:chapter]`, `GET|POST /glossary` (+ `/glossary/:id` PATCH, `/glossary/:id/approve`, `/reject`, `/glossary/decisions`), `POST /chapters/:chapter/finalize` and `/reopen` (both chapter-scoped — there is no top-level `/translation/finalize`), `GET /manuscript`. Project kind `translation` only (`TRN_003`). Bot ingest: `PUT /api/v1/ingest/projects/:T/originals/:chapter` and `GET .../originals` (needs `novel-forge:curate`).
- **Preconditions:** `POST /api/v1/projects {"name":"TR sample","kind":"translation","originalLanguage":"zh"}` (201; omitting `originalLanguage` on a `translation` kind gives `PRJ_006`). UI: home "New novel" dialog titled "Start a new novel" -> segment "Translate a novel" -> "Original language"; the modal only ever creates `new_novel` or `translation`, so `source` projects can only be created by import (`NewNovelModal.tsx:43-49`). Settings via API: `PUT /translation/config {"settings":{"maxRepairs":1,"segmentTokens":200,"honorifics":"keep","pauseAfterSeed":true}}` (200 tokens forces 2 segments per chapter).
- **Run:** 1. Paste S3 ch 1-3 via `PUT /translation/originals/{1,2,3}` (201 created; same body again 204; changed body 200 + `source_stale`). Negatives: English text in ch 1 -> field error `content` "does not look like zh"; ch 5 when 3 is last -> `TRN_010`. 2. `POST /translation {}`: **[AI]** seed `translate-seed@1.0.0` (role `translate`), then the job pauses. 3. Review terms; approve all but one, edit one target, reject one, add one manual term. 4. `POST /translation {}` again: per chapter graph `loadChapter, assembleContext, segment, translateSegment x2, join, fidelityScan, audit, (prepareRepair, translateSegment), persistTranslation, mergeGlossary, finish` (`translate-chapter@1.0.0` role `translate`, `translate-audit@1.0.0` role `audit`). 5. Finalize each chapter. 6. Staleness: `PATCH /translation/glossary/:id {"target":"..."}` on an applied term.
- **Verify:** after step 2: `translations.phase='review'`, job `done`, `style_notes` non-empty (decides voice, name order, honorifics, punctuation), `translation_glossary` rows `status='suggested', origin='seed', created_chapter=0` (expect 沈砚, 老柯, 雾港, 无火灯, 夜灯会, 灯正), 0 `chapter_translations`. After step 3: statuses `approved/rejected`, edited row `revision=2`, manual row `origin='manual', status='approved'`; reject bumps nothing. After step 4: `chapter_translations` 3 rows `translated|attention`, `applied_terms` = `{termId: revision}`, `segments` length 2, `body` paragraphs match the original count within [0.6,1.6]; `mergeGlossary` adds `origin='discovered'` `suggested` rows. Deterministic scan (`fidelity-scan.ts`) issue types: `source_script_residue`, `glossary_violation`, `number_drift`, `paragraph_drift`, `dialogue_drift`, `length_band` (zh band 1.2-3.2). Finalize gates: pending (`suggested`) applied term -> 400 `TRN_005`; stale glossary -> 409 `TRN_006`; changed original -> 409 `TRN_011`; finalized edit -> `TRN_004`. A discovered term in ch 1 lands in ch 2's slice as provisional, so ch 2 cannot finalize until reviewed (TRN_005). Finalize copies `body` to `chapters.content`, sets `locked=true`, `word_count`, `chapter_translations.status='finalized'`. Step 6: rows containing that id get `glossary_stale=true`; `POST /translation {"stale":true}` re-runs only those; a finalized chapter is never a target (reopen first). Invariant: nothing reaches `chapters.content` except finalize.
- **Quality check:** (a) `沈砚` rendered identically in every chapter and equal to the approved target; `无火灯` never varies. (b) digits `12` and `300` survive; false-positive probe: if the translator writes `300` for `三百年` the scan flags `number_drift` with `unexpected number(s) not in the original: 300` and burns a repair pass (`normalizeDigits` maps only full-width digits to ASCII, so hanzi numerals can never match). Record how often it happens. (c) no omission/addition: read ch 3's 3 rules against the original. (d) `沈师兄` follows `honorifics` (keep: "Shen shixiong"; translate: "Senior Brother Shen"). (e) English quote count within 25% of the original's (`DIALOGUE_DRIFT_THRESHOLD`; the scan counts all zh quote marks on the source side and `“ ” "` on the translation side). (f) `translate-audit` flags only real omission/meaning shifts, no style critique. (g) prose reads native, not word-for-word.
- **Fails when:** job `failed` "Translation is not seeded" (`style_notes` empty); `TRN_003` on a wrong kind; audit false positives keep chapters at `attention`; `lastError` stamped on a good row (only the error is stamped; body and revision are preserved on a failed re-run).
- **Cost:** seed 1, then 2 segment calls + 1 audit per chapter (+2 per repair): about 10 calls for 3 chapters.

#### 2.10 Curated ingest (deterministic, not AI)

- **Entry:** `PUT /api/v1/ingest/novels/:sourceRef` (201 created / 200 existing), `PUT .../chapters/:sourceOrdinal` (201, 204 when nothing landed), `POST .../cover` (204), `GET .../manifest` (200) — sourceRef e.g. `test:001`. Needs permission `novel-forge:curate` (session, or bot key `sl_bot_...`). No interactive web UI; the only reference is an informational hint on the Translation screen describing the originals-ingest door.
- **Preconditions:** a caller holding `novel-forge:curate`. Curated projects cannot be created via `POST /projects` (`PRJ_005`).
- **Input:** S4 ingest bodies (chapter bodies also accept `authorNote`).
- **Run:** 1. PUT novel (201, then again 200 with `created:false`). 2. PUT ordinals 1, 2. 3. Re-push ordinal 1 unchanged. 4. Re-push ordinal 1 with different text. 5. PUT ordinal 4. 6. GET manifest.
- **Verify:** `projects.kind='curated'`, `source_ref='test:001'`; `chapters` `locked=true, generator='human', status='done'`, `source_ordinal` 1..2, `content_hash` = `chapterContentHash({title,content})`; step 3 -> 204 no-op; step 4 -> 409 `ING_003`; step 5 -> 409 `ING_002` (no gaps); manifest lists `{sourceOrdinal, contentHash}` only; `ingest_audit_log` has a row per call (`landed|noop|created|...`). Invariant: `select count(*) from model_calls where project_id=P` is 0.
- **Quality check:** none (deterministic).
- **Fails when:** `IAM_002` missing permission; `ING_001` foreign or unknown sourceRef (answered like absent); 409s above.

### 3. Harness-vs-baseline probes (cheap, same manuscript)

Take S1 chapter 2 and run it through (a) recipe 2.6 and (b) a single well-written prompt of your own (any model) with the same world notes. Compare with the leak query and by hand: replacement consistency, beat preservation, `fixes` recall on the two plants, nationalism handling, and edited-word ratio. Record what the pipeline adds beyond a single good prompt: (1) residue scan catching lowercase leftovers a model missed (plant `huaxia banner` in a repaired output to see it), (2) repair rate per chapter, (3) audit-only catches (`source:'audit'` issues the scan could not see), (4) glossary continuity across chapters (`prev_ending`, discovered names), (5) cost: calls and tokens per accepted chapter versus one baseline call. If (1)-(4) are empty on S1, the orchestration is mostly overhead for this manuscript.

---

## Part 5: chat hub, illustrations, plugins, settings, quota, admin inspection

Base: every route is under `/api/v1`. `$P` = project id, `$S` = chat session id, `$T` = bearer token. Short paths are relative to `apps/novel-forge-server/src/modules/`; anything outside that is given from the repository root.
Cost basis (from `ai/models.ts`, USD per 1M tokens in/out): glm-5.2 0.97/3.04 (chat+planning default), claude-sonnet-5 2/10 (review), gpt-5.6-luna 0.2/1.2 (helper), kimi-k3 3/15 (writing), claude-haiku-4.5 1/5. One hub turn is about 3-8k input tokens, so roughly $0.005-0.03.

---

### 0. Admin inspection surface (read this first — every other recipe leans on it)

#### 0.1 Access

- **Gate.** `GET /projects/:p/runs/:runId`, `/runs/:runId/context` and `/runs/:runId/calls/:callId` carry `@RequirePermission('novel-forge:admin', { highRisk: true })` (`generation/generation.controller.ts:329,344,351`). The PDP check runs in the caller's org (`packages/auth/src/module/auth-guard.ts:197`). A non-admin gets 403 `IAM_002` (`apps/novel-forge-server/tests/generation/run-admin-gate.spec.ts`).
- **Ungated.** `GET /projects/:p/runs` (latest 20 author-facing runs), `GET /projects/:p/ai-usage`, `GET /projects/:p/context/preview` and `GET /projects/:p/drafts/:n/prompt`. The preview route's `@BotPermission('novel-forge:generation:run')` binds bot tokens only; a user session needs nothing beyond the controller's `novel-forge:projects:read` floor.
- **UI.** "Workflow Runs" (`/novels/$novelId/runs`) checks a different thing: the session's OIDC **scope** list must contain `novel-forge:admin` (`apps/novel-forge-web/src/lib/session.ts:11`, fed by `packages/auth/src/module/auth.controller.ts:153`). Without it the screen shows "Workflow Runs needs the admin scope" and issues no requests.
- **How to actually get the grant.** `novel-forge:admin` is a PDP permission (`apps/novel-forge-server/src/constants.ts:12`) that nothing grants today:
  - It is absent from `NOVEL_FORGE_ROLE_CATALOG` (`auth/role-catalog.constants.ts`) and from identity's own seed for this app, which declares only `novel-forge:curate` / `NovelForgeCurator` (`apps/identity-server/src/modules/bootstrap/ecosystem-seed.constants.ts:137-159`).
  - The server pushes that catalog to identity on every boot (`packages/auth/src/module/auth.module.ts:78`) and identity deletes every permission and role absent from it (`apps/identity-server/src/modules/authz/catalog-sync.service.ts:192,205`). Its "more than half" guardrail does not fire for one extra row, so a hand-seeded permission is silently wiped at the next boot.
  - Identity's admin API only lists permissions and assigns or revokes role assignments (`apps/identity-server/src/modules/admin/admin-role.controller.ts:83,91,105`) — it cannot create a permission or a role. The PDP resolves permissions purely from role assignments, with no superuser bypass (`authz/policy-decision.service.ts:183-190`).
  - The one durable path: add the permission plus a role carrying it to `NOVEL_FORGE_ROLE_CATALOG`, restart the server so the catalog syncs, then assign that role through identity's `POST /api/v1/admin/role-assignments`. That is a code change, not an operator action.
  - The UI gate cannot be satisfied at all right now: it reads token scopes, and `novel-forge:admin` is not a registered OAuth scope for this application. Expect the API to answer while the screen stays locked.
- **Fallback with no admin grant.** Query the DB directly (0.7).

#### 0.2 What each endpoint returns

| Endpoint                                              | Gives you                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /runs`                                           | The 20 newest author-facing runs (graph allowlist `AUTHOR_FACING_GRAPHS`, `generation.service.ts:125`). Fields: `id, projectId, graph, target, status, outcome, input, error, nodeTrace, jobId, startedAt, endedAt`. `chat-title` and `chat-compact` are NOT listed (fetch them by id).                                                                                                                                                                      |
| `GET /runs/:id` (admin)                               | Adds `modelCalls[]` (`id,node,role,provider,model,promptKey,promptVersion,status,inputTokens,outputTokens,latencyMs,costUsd,attempt,createdAt`), `toolCalls[]` (`id,node,tool,args,status,resultDigest,latencyMs,createdAt`) and `contextPack{id,purpose,budgetTokens,usedTokens,sections[{key,tier,segment,tokens,truncated}]}`.                                                                                                                            |
| `GET /runs/:id/context` (admin)                       | Pack summary plus `rendered`: the exact stable-then-volatile context text. 404 `CTX_001` if no pack is linked.                                                                                                                                                                                                                                                                                                                                               |
| `GET /runs/:id/calls/:callId` (admin)                 | Model-call row plus `rawOutput` (the raw text, stored before parsing) and `error`.                                                                                                                                                                                                                                                                                                                                                                           |
| `GET /context/preview?purpose=chat&scopeType=project` | View of a pack: `purpose`, `budgetTokens`, `usedTokens`, `sections`, `omitted[{key,reason}]` (reason `budget` or `unresolved`), `unresolvedRefs`, `renderedStable`, `renderedVolatile`, `rendered`. Purposes: `generation, outline, chat, arc_plan, premise, audit`. `chat` needs `scopeType` (else 400 `CHT_003`); `arc_plan` needs `volumeKey` (else `VOL_001`). Only `generation` is dry — every other purpose persists a `context_packs` row (see 6.10). |
| `GET /ai-usage`                                       | Per-role calls and tokens. See 0.5: `costUsd` is understated.                                                                                                                                                                                                                                                                                                                                                                                                |

#### 0.3 What is NOT recorded

- **System prompt, scope playbook, history, JSON-schema suffix and plugin system messages are not stored.** `model_calls` holds no request body. `context_packs.rendered` is only the stable and volatile context.
- **Tool results are not stored.** Only `args` and a 16-hex sha256 digest.
- **Pack coverage.** One pack is linked per run (`workflow_runs.context_pack_id`). `illustration` runs link none (`illustration.service.ts` never calls `linkContextPack`), so `/context` returns 404 `CTX_001`. Find those packs in `context_packs` with `purpose='illustration'`. `chat-title` and `chat-compact` link none either.
- **DB-only columns.** `model_calls.cached_input_tokens`, `plugins`, `policy_digest` and `context_packs.omitted`, `unresolved_refs` are not in any DTO.
- **Cache hits write no row.** Roles `judge, validation, continuity, extraction, review, audit, compact` are served from `llm_cache` on an identical request (`ai/model-router.service.ts:67,368`). A repeat produces zero `model_calls` rows; the debug log says "LLM cache hit — skipping model call".

#### 0.4 Reconstruct the exact prompt of any call

1. Take `promptKey@promptVersion` from the call row and open `ai/prompts/<promptKey>.prompt.ts` (chat hub: `chat-refine.prompt.ts`, version 2.1.0). The template is there, and the version must bump on any wording change.
2. Fill the variables. For `chat-refine`:
   - `scopeInstructions` = `renderScopeInstructions('project')` (`ai/prompts/scope-playbooks.ts`) plus the lookup vocabulary.
   - `stableContext` = the pack's stable segment.
   - `history` = `chat_sessions.summary` (as "Conversation so far…") plus `chat_messages` with `ordinal > summary_through_ordinal`. On a lookup round it also carries the previous JSON reply and a "Lookup results:" human message.
   - `volatileContext` = the pack's volatile segment.
   - `userMessage` = the turn text.
3. Then append what the router adds (`buildMessages`, `ai/model-router.service.ts:574`):
   - a final human message: "Respond with ONLY one valid JSON object matching this JSON schema…";
   - plugin `prompt.contribute` system messages, inserted after the leading system messages;
   - `cache_control` breakpoints only when the module has a `cacheStrategy` AND the resolved provider is `openrouter` with a model id starting `anthropic/` (`supportsPromptCaching`). `chat-refine` has one, over `scopeInstructions` and `stableContext`.
4. **Shortcut, dev only.** With `LOG_LEVEL=debug` the server logs `structured: invoking model` (`ai/model-router.service.ts:355`) with `input` (all template variables, not the system prompt or schema). Query `shadow-logs-dev`: `{environment="dev",namespace="novel-forge",component="server"} |= "structured: invoking model"`, bounded by start/end. Prod does not log it.
5. `AI_LANGSMITH_API_KEY` is loaded as `ai.langsmith.api.key` (`bootstrap.ts:56`) but nothing reads it back — there is no tracing wiring in `apps/novel-forge-server/src`, so setting it changes nothing.

#### 0.5 Tokens and cost per call

- `input_tokens = max(provider-reported, tiktoken o200k_base estimate of the prompt)` (`ai/telemetry.handler.ts:84`). It is a floor and can be slightly high. `output_tokens` is provider-reported, else estimated. Reasoning tokens bill as output on the provider side but are not split out.
- `cost_usd` is written ONLY for image calls (`recordImageCall`, `ai/model-router.service.ts:534`, from the provider's `usage.cost` — null when the provider reports none). Every text call has `cost_usd NULL`.
- **Compute text cost yourself:** `input_tokens/1e6 × inputPrice + output_tokens/1e6 × outputPrice`, prices from `GET /ai/models`. This is exactly what the quota guard does (`ai/quota.ts`). Cached tokens are billed at full price, so it is an upper bound.
- Consequence: the Overview "AI Usage & Cost" tile, `GET /ai-usage.totalCostUsd` and the Workflow Runs "Cost" column show only image spend, so text spend reads as `$0.00` or "—".

#### 0.6 Reading retries, repairs and cache

- `model_calls.status` is only ever `ok` or `transport_error`. `parse_error`, `repaired`, `refused` and `timeout` exist in the enum but are never written (`ai/telemetry.handler.ts:174,206`), so the UI "repaired" chip never appears.
- **A schema-failed first reply is still status `ok`.** The repair ladder shows as an extra row with `attempt = 1` on the same node. Repair rate per prompt = rows with `attempt>0` ÷ rows with `attempt=0`.
- **Tolerant extraction (third rung) leaves no row.** Only a debug log, "parsed via tolerant extraction".
- **Total failure.** Run `status='failed'`, `error.code='AI_001'`, two `ok` rows (attempt 0 and 1).
- **Hub lookup rounds** are additional `chat-turn` rows with `attempt=0`. Count them as `model_calls − repairs`, and match them against `tool_calls.created_at`.

#### 0.7 SQL (fallback and cross-checks)

```sql
select node,role,provider,model,prompt_key||'@'||prompt_version pk,attempt,status,input_tokens in_t,cached_input_tokens c_t,output_tokens out_t,latency_ms,cost_usd,plugins,policy_digest from model_calls where run_id='<run>' order by id;
select tool,args,status,result_digest,model_call_id from tool_calls where run_id='<run>' order by id;
select prompt_key,prompt_version,model,count(*) filter(where attempt=0) calls,count(*) filter(where attempt>0) repairs,sum(input_tokens) in_t,sum(output_tokens) out_t from model_calls where project_id=<P> group by 1,2,3;
select purpose,budget_tokens,used_tokens,sections,omitted,unresolved_refs,left(rendered,400) from context_packs where id=(select context_pack_id from workflow_runs where id='<run>');
```

---

### 1. Chat hub

Ordinary hub turns run `chat-refine@2.1.0`, role `chat` (planning-group model), node `chat-turn`, graph `chat-turn`.

- Session routes: `/projects/:p/chat/sessions...`. Non-streaming turn: `POST /chat/sessions/:s/messages`. Streaming turn: `POST /projects/:p/chats/:s/turn/stream` (note `chats`, not `chat/sessions`).
- Sessions are always scope `project` (`chat.service.ts:205`); the request body has no scope field.
- **Fixture used by blocks 1.1-1.9.** Create it once: `POST /projects {"name":"Tidewrights QA","kind":"new_novel"}`. Block 1.1 builds its canon.

#### 1.1 Manual hub turn: materialise canon as a staged proposal

- **Entry:** UI "Refinement Chat" (`/novels/$novelId/chat`), composer placeholder "Ask for anything — edits, prose, pipeline runs…", mode toggle Manual/Auto. API `POST /chat/sessions {"mode":"manual"}` then `POST /chat/sessions/$S/messages`. Project kind `new_novel` or `source`.
- **Preconditions:** empty new_novel project.
- **Input** (`content`):
  > Set up canon for a serialized web novel, The Tidewrights. In the port city of Saltmarrow the sea takes a district every spring tide unless the Tidewrights Guild returns one named memory to the water (the Memory Tithe). Wren Okafor, a Guild apprentice, sold her dead mother's memory of the lighthouse to the smuggler Marrow Vance to pay a 40-silver debt, and wants it back. Harbour Warden Ilse Brandt secretly plans to burn the Drowned Archive, where the Ledger of Foam records every tithed memory, so none can ever be bought back. SECRET, hidden until chapter 30: the Compact was signed not with the sea but with something under the harbour that feeds on memory. Create entity records for Wren, Marrow, Ilse, the Tidewrights Guild, the Drowned Archive and the Memory Tithe rule. Give each character a want, a wound and a speech habit. Put the secret in a canon fact only. Plan 2 volumes of 30 chapters. Do not run generation.
- **Run:**
  1. Send it and wait for the reply.
  2. `GET /projects/$P/proposals?status=pending`.
  3. Do NOT apply yet (blocks 1.4-1.5 use this proposal).
- **Verify:**
  - Response 201 has `assistantMessage`, `proposal` (`kind:'hub'`, `status:'pending'`, `autoApplied:false`) and no `applied` field. Domain tables are still empty: `entities`, `canon_facts` and `volumes` have 0 rows for `$P`.
  - `proposal.changeSet` holds roughly 6 `entity.upsert`, 1 `fact.upsert` and 2 `volume.upsert`, each with `rationale`. There are no `action.*` ops despite "Do not run generation".
  - `proposal.baseline` has one entry per touched ref, each with `exists:false`.
  - `chat_messages` ordinals 1 (user) and 2 (assistant); `proposalId` is set on the assistant message; `chat_sessions.title` is auto-set within seconds. It comes from a separate `chat-title@1.0.0` run (role `title`, helper model) that appears only in `model_calls`. The first message must be at least 15 characters.
  - Run: `GET /runs/<runId>` shows one `chat-refine@2.1.0` call, `attempt 0`, model `z-ai/glm-5.2`. The pack has purpose `chat_hub` with sections `premise`, `pipeline_status` and maybe `catalog`.
  - **Quality:**
    - Each character record states a want, a wound and a speech habit, and Marrow and Ilse are not generic villains.
    - The secret appears ONLY in the `fact.upsert` body, with a POV-safe `constraintNote` and tell-tale `terms`. It is absent from entity bodies and bible prose.
    - The volumes carry `targetChapterCount: 30` and distinct objective, conflict and payoff.
- **Fails when:**
  - No proposal but a reply: the model discussed instead of staging. Check the raw output in `/calls/:id`.
  - 400 `RFN_004`: the change-set failed validation (op not in the hub allowlist, or an entity-bearing bible document without matching `entity.upsert`).
  - `AI_001` on the run: a repair failure.
  - A bible document staged instead of records: the playbook forbids this (`scope-playbooks.ts`).

#### 1.2 Hub declared lookups (index-only context, fetch-before-overwrite)

- **Entry:** same session as 1.1, after applying the 1.1 proposal (see 1.4). The hub context is an index: one-line volumes, first line of each document, no briefs and no prose.
- **Preconditions:** volumes and entities exist (apply 1.1 first).
- **Input:** `Rewrite volume 1's conflict so the Warden's plot to burn the Archive drives it, not Wren's debt. Keep everything else on the volume as is.`
- **Run:**
  1. Send it. Expect a first reply that is only a lookup request (`reply` plus `lookups`), then the real answer.
  2. Optional streaming variant: block 1.8.
- **Verify:**
  - `GET /runs/<runId>` `toolCalls`: at least one row `tool=get_volume`, `node=chat-hub`, `args.volumeKey=<v1 key>`, `status=ok`, non-empty `resultDigest`. `model_calls` has 2 or more `chat-refine` rows (one per lookup round).
  - The final `changeSet` is a `volume.upsert` carrying only `volumeKey` plus the changed field(s) (`conflict`, maybe `body`). Re-emitting objective, payoff, cast etc. is a violation of the prompt's partial-update rule.
  - **Invariant, checked by hand.** The whole-record-overwrite rule is prompt-only; no code enforces it (`chat.service.ts` has no check). So verify that for every `volume.upsert`, `arc.upsert`, `bible_document.upsert`, `brief.update` or `draft.update` in a change-set, a matching `get_*` row exists in the same run's `tool_calls`.
  - A turn never contains both `lookups` and `changeSet` (`postValidate`, `chat-refine.prompt.ts`).
  - **Budget:** at most 3 lookup rounds (`MAX_LOOKUP_ROUNDS`). Per-tool caps: `get_draft` 2, `get_brief` 8, `get_volume`/`get_arc`/`get_bible_document`/`search_lore` 10, `get_entity` 15, others 5-8. Over budget writes `tool_calls.status='budget_exceeded'`. Exhausting rounds forces a reply with no lookups. It is silent; error code `CHT_004` exists but is never thrown.
  - **Quality:** the new conflict text is coherent with the Ledger and Archive facts from 1.1, and the reply says WHY in web-novel terms (hook, escalation).
- **Fails when:**
  - `tool_calls.status='invalid_args'`: the model used a wrong arg name.
  - A `volume.upsert` with no `get_volume` row: blind overwrite (prompt-following defect).
  - `search_lore` and `search_prose` return "No lore found" or fail: they need Ollama embeddings (`AI_OLLAMA_HOST`) and indexed content. Draft and isolated content is never indexed.

#### 1.3 Hub pushback quality (harness-vs-baseline comparison)

- **Entry:** a fresh manual session on the 1.1 canon.
- **Input:** `Big twist idea: Ilse Brandt is secretly Wren's mother, alive all along. Add it as a fact and rewrite Ilse's entity to match.`
- **Run:** send it, then paste the same message plus the full bible into a plain single-prompt chat with the same model and compare.
- **Verify:**
  - Reply challenges the idea directly with reasons (hook and reader-promise terms). Note that Wren's mother is already "dead" and her lighthouse memory sold, so the twist contradicts stated canon unless reconciled. It offers concrete alternatives, and stages no `changeSet` (the turn is debate).
  - Count lookups the hub needed: a high `tool_calls` count or blind claims indicate index-only blindness. Compare depth and specificity with the skill's answer.
  - If a `changeSet` is staged anyway, that is a compliance defect (the prompt says explore first, stage only when converged). Note whether it invented refs or entity keys not in context.
- **Fails when:** sycophantic agreement, or invented keys (rejected at apply as a baseline or missing-entity failure).

#### 1.4 Per-op cherry-pick apply and baseline conflict

- **Entry:** UI: in the chat, the turn card "N changes" with a checkbox per op and the "Apply N selected" and "Decline all" buttons, or the "Proposals" screen. API `POST /proposals/:id/apply {"opIndexes":[...]}`.
- **Preconditions:** the pending 1.1 proposal (call it `$X`).
- **Run:**
  1. `PATCH /proposals/$X {"changeSet":[<the ops>]}`: hand-edit (for example delete the `volume.upsert` op for volume 2). Ops are re-validated and the baseline is re-captured for the new refs.
  2. `POST /proposals/$X/apply {"opIndexes":[0,1]}` (cherry-pick two ops).
  3. Negative: `{"opIndexes":[]}` or `[99]`. Also: apply, edit the entity in Story Bible, and try another proposal that touches it.
- **Verify:**
  - Response `applied[]` lists only the selected refs with `newRevision`. `opResults` shows selected ops `applied` and the rest `declined` (no `note`). Only the selected artifacts exist in `entities`, `canon_facts` and `volumes`.
  - `refinement_proposals.status='applied'`, `applied_at` set, `inverse_ops` and `post_state` filled. `user_feedback` gets 1 `approved` row, plus 1 `rejected` row "declined ops: …".
  - **Cherry-pick is final.** The proposal is `applied`, so the declined ops can never be applied later; you must ask again.
  - Bad selection returns 400 `RFN_011`. A second apply returns 400 `RFN_002` (not pending).
  - **Baseline conflict.** Stage a proposal touching entity E, hand-edit E (`PATCH /entities/:key {"notes":"x"}`), then apply. The result is 409 `RFN_003` and the proposal is now `conflicted` (`error.mismatches` lists refs). It can only be discarded (`POST /proposals/:id/discard`); UI "Baseline changed underneath this proposal".
- **Fails when:** an unselected op still lands (apply guard bug). Note that the `changeSet` PATCH accepts ops outside the hub scope by design-gap: `updateChangeSet` validates with no scope allowlist (`proposal.service.ts:184`), so a hand-edit can add `seed.update` to a hub proposal. Confirm it, and treat it as the defect in 6.8 rather than a test failure.

#### 1.5 Action ops and one-way doors (`never auto-applied`)

- **Entry:** proposals containing `action.*` ops (hub `HUB_ACTION_TYPES`: generate_chapters, plan_volumes, plan_arcs, outline_arc, audit_bible, enhance_premise, judge_draft, revise_draft, approve_draft, approve_volume_plan, approve_arcs, validate, finalize).
- **Preconditions:** a pending proposal (any) from 1.1, or a fresh one from a cheap turn.
- **Run** (deterministic; no model needed to stage):
  1. `PATCH /proposals/$X {"changeSet":[{"op":"entity.upsert","entityKey":"harbour-bell","type":"item","name":"Harbour Bell"},{"op":"action.finalize","upTo":1}]}`
  2. `POST /proposals/$X/apply {}` (blanket apply).
  3. `POST /proposals/$X/apply {"opIndexes":[0]}` (content only).
  4. Separately: `PATCH … [{"op":"action.audit_bible"}]` then `apply {}`.
- **Verify:**
  - Step 2 returns 400 `RFN_009` "Finalize is never applied automatically", and nothing is applied.
  - Step 3 applies the entity; `opResults[1]` is `declined`. The proposal is now `applied`, so finalize can no longer be selected from it (only `[1]` explicitly, before step 3, would run it: irreversible).
  - **Audit action.** `opResults[0].status='applied'`, `result.summary` "bible audit staged N finding(s) — proposal Y pending review" (or "found nothing to change"). A new proposal `kind='bible_audit'` appears; `workflow_runs.graph='bible-audit'` (role `audit`, claude-sonnet-5).
  - **Actions never revert.** An action-only proposal has empty `inverse_ops` and `revertible:false`. Actions run after the content transaction commits, sequentially and fail-fast. A failed action gives `opResults[i].status='failed'` plus `error`, later actions "skipped", HTTP still 200, and `proposal.error={"actionFailure":true}`.
  - UI: a guarded op is unchecked by default with "Applies only when you select it deliberately." The UI always sends explicit `opIndexes`.
  - `action.graduate_seed` is the same door (`RFN_009`/`IDE_007`) but belongs to the Ideation Studio; it is not offered to the hub.
- **Fails when:**
  - 500 `RFN_008`: it means "no executor registered for this action" (`proposal-apply.service.ts:246`), not an action failure, despite its message. Per-action failures are in `opResults`.
  - An action runs during a blanket apply of a proposal that contains finalize (guard broken).

#### 1.6 Auto mode

- **Entry:** UI mode toggle "Auto" (hint "Auto — changes apply instantly, revertible from History"), or `PATCH /chat/sessions/$S {"mode":"auto"}`. Mode is switchable mid-chat.
- **Preconditions:** 1.1 canon applied.
- **Input:** `Change Wren's speech habit: instead of counting things she hums the tide table. Update her record.`
- **Run:** send it in an auto session; read the 201 body, `GET /changes`, and `GET /entities/<wren-key>`.
- **Verify:**
  - Response has `proposal.status='applied'`, `autoApplied:true`, `applied.applied[]` with `artifactRef:'entity:<key>'`. The `entities` row is updated in the same request. `GET /changes` lists it with `autoApplied:true` (UI chip "auto").
  - Only the changed fields are in the op (`notes` or `body`). Untouched fields are unchanged in DB.
  - **Failure downgrade.** If the canon moved since context assembly, `applyNote` carries the error message and the proposal is `conflicted` (`chat.service.ts:503`; its comment wrongly says "pending"). Reproducing it needs a race — auto staging and applying are one request, so use two tabs or a slow model — and may take several tries.
  - One-way doors: if the model includes `action.finalize` or `graduate`, auto apply lands the other ops and returns the door's `note` in `applyNote`, with that op `declined`. Model-dependent; the deterministic path is 1.5.
- **Fails when:** `applied` is missing on an auto turn with a proposal (auto-apply threw: read `applyNote`), or the turn returns 500 (auto-apply must never fail the turn).

#### 1.7 Revert, rollback, change history

- **Entry:** UI chat "History" button (dialog "Change history": rows with Revert and "Roll back to here"), the turn card "Revert", and the "Changes in this chat" panel (groups "Waiting on you" and "Applied"). API `GET /changes`, `POST /proposals/:id/revert`, `POST /changes/rollback {"afterProposalId":"<id>"}`.
- **Preconditions:** two applied proposals, `$P1` (1.1 canon) then `$P2` (1.6 edit).
- **Run:**
  1. Revert `$P2`.
  2. Re-apply a new edit `$P3` (another turn), then hand-edit that entity (`PATCH /entities/:key {"notes":"manual"}`) and revert `$P3`.
  3. `POST /changes/rollback {"afterProposalId":"$P1"}` after `$P2`, `$P3` exist.
- **Verify:**
  - Step 1: 200 `{proposal:{status:'reverted',revertedAt}, reverted:[…]}`; the entity is back to its pre-`$P2` values. `revision` moved forward (never back). `user_feedback` has a `rejected/reverted` row.
  - Step 2: 409 `RFN_006` (content changed since apply); nothing touched and `$P3` stays `applied`. The guard is content hash and existence, not revision.
  - Step 3: rollback returns 200 even when it stops: `reverted[]` (newest first), `skipped[]` (action-only), `stoppedAt`, `conflict:{code:'RFN_006'}`. Check `stoppedAt`, not just the status code. Older applied proposals stay applied. It is project-wide, across sessions.
  - Reverting `$P1` (a creation) removes the entities, fact and volumes it created.
  - `GET /changes` newest-first, only `applied` and `reverted`, `revertible` is `applied` and has inverse ops. Reverting a reverted or action-only proposal gives 400 `RFN_007`. Actions (generated drafts, runs) are not undone (dialog text says so).
- **Fails when:** a revert succeeds after a hand-edit (guard missing), or `revision` decreases.

#### 1.8 Streaming turn (POST + SSE) and Stop

- **Entry:** UI (default path; the composer streams). API: `POST /projects/$P/chats/$S/turn/stream {"content":"..."}` returns 202 `{runId}`; then `GET /projects/$P/turns/<runId>/stream` (SSE).
- **Preconditions:** a session; token with `projects:write` and `generation:run`.
- **Input:** `Give me three candidate names for the ferry that crosses the Saltmarrow harbour, each with a one-line reason. No changes yet.`
- **Run:**
  1. POST, then `curl -N -H "Authorization: Bearer $T" .../turns/<runId>/stream`.
  2. Reconnect the GET after `done` within 60 s.
  3. Stop test: send a long prompt and `POST /projects/$P/runs/<runId>/cancel` mid-stream.
- **Verify:**
  - SSE order: `ready`; `reset` (replay opener); `user` (user message); optional `lookup` `{round,tool,args,status:'running'→'ok'|'error'}`; many `delta` `{text}`; optional `reset`; final `done` (`{userMessage,assistantMessage,proposal?,applied?,applyNote?,runId}`) or `error` `{code,message}`. The stream closes after the terminal frame.
  - Concatenated `delta` text equals `assistantMessage.content`; if it does not, a `reset` must precede the corrected text. Deltas are the model's `reply` field only, never raw JSON. A model that returns no `reply` key gives no deltas (log "Model defeated the reply stream").
  - Reconnect after `done` replays everything (within 60 s TTL); another project's run returns 404 `CHT_007`.
  - The turn completes and persists even if nobody connects (`GET /chat/sessions/$S/turn` polls `pendingTurn`/`failedTurn`/`lastOrdinal`).
  - Cancel: `outcome:'stopping'`; run `status='cancelled'`; `GET /messages` returns `failedTurn.status='cancelled'` and the UI shows "Stopped". `already_settled` if it finished; `not_delivered` on another replica.
  - Non-streaming twin `POST /chat/sessions/$S/messages` produces the same run and DB rows.
- **Fails when:** `done` never arrives (proxy buffering SSE), the UI spinner never clears (see `pendingTurn` cutoff 15 min), or 404 `CHT_007` after 60 s.

#### 1.9 Context compaction

- **Entry:** automatic at the start of a turn (`chat-compaction.service.ts`).
- **Preconditions:** a manual session with at least 8 messages.
- **Trigger** (`compactIfNeeded`): messages after `summary_through_ordinal` number more than 6 AND (their tokens exceed `CHAT_HISTORY_BUDGET` 6000 OR count exceeds 12).
  - Cheap path: 4 turns each pasting about 1000-1500 tokens of notes (a 5th turn then compacts).
  - Plain path: 7 short turns.
- **Input:**
  - Turn 1 (plant sentinels): `Decision: Marrow's debt stays at 40 silver. We REJECTED making the ferryman a ghost. Open question: who owns the harbour bell?`
  - Later turns: any chatter or pasted notes.
  - Final turn: `Recap: what did we decide about the debt, what did we reject, and what is still open?`
- **Verify:**
  - `chat_sessions.summary` non-null and `summary_through_ordinal = ` the ordinal of the last folded message. Messages are never deleted (all rows remain).
  - A `chat-compact` run (`graph='chat-compact'`, model call `chat-compact@1.0.0`, role `compact`, helper-group model, node `chat-compact`). It is not in `GET /runs`; fetch by id (find it via `workflow_runs where graph='chat-compact'`). `compact` is a cacheable role, so an identical fold re-uses `llm_cache` with no call row.
  - Next turn's `history` starts with "Conversation so far (compacted summary):" and keeps the newest 6 messages verbatim.
  - **Quality:** the recap answers 40 silver, rejected the ghost ferryman, and the open bell question (the summary preserved decisions, rejections and open questions and invented nothing).
- **Fails when:** the summary drops the rejection or an open question, the recap contradicts it, or compaction fires on every turn (watermark not advancing).

---

### 2. Illustrations (image-generation path)

Common: `POST /projects/:p/illustrations` returns 201; every other route here returns 200. For bots, start and refine need `illustrations:write` AND `generation:run`; select, save, discard and `PUT /references` need only `illustrations:write`; the GETs need only the controller's `projects:read`. One start makes about 2-3 model calls:

- `illustration-compose@1.1.0`: role `illustration` (helper group, gpt-5.6-luna), node `compose`, structured, `cost_usd` null.
- Image call: role `image` (grok-imagine-image-2.0), node `generate`, 2 candidates, `raw_output` NULL, tokens NULL, `cost_usd` recorded when the provider reports it. It reuses the compose spec's `promptKey@promptVersion`, so it also reads `illustration-compose@1.1.0`.
- Optionally `appearance-describe@1.0.0` (role `vision`, `node` NULL) when a likeness reference with a loaded image exists and the entity has no appearance. It is best-effort; a failure is swallowed.

Graph is `illustration` (in `GET /runs`). UI: "Illustrations" → "Start an illustration" dialog: Subject = "An entity" / "A chapter scene" / "The project cover"; "Art direction" textarea.

#### 2.1 Entity portrait (compose + render + derived appearance)

- **Entry:** UI "Illustrations" → Start → An entity. API `POST /illustrations {"subjectType":"entity","subjectKey":"<wren key>","instruction":"..."}`.
- **Preconditions:** entity Wren exists (1.1) with EMPTY `appearance` (`GET /entities/<key>`); `AI_OPENROUTER_API_KEY` set; storage configured.
- **Input:** `subjectType:entity`, `instruction`: `three-quarter view, harbour fog at dawn, cold blue key light, weathered apprentice coat`.
- **Verify:**
  - 201 with `status:'active'`, `revision:1`, `candidates` of 2 (each `ref`, `imageUrl` that loads with 200, `references`), `prompt` (the exact rendered image prompt), `instructions:[<your text>]`, and `suggestedAppearance` set. The composer invented an appearance, and the UI shows "Forge invented this appearance" with a save-to-entity action.
  - `illustrations.prompt_spec` JSON: `basePrompt`, `subjectFraming`, `styleNotes`, `negativePrompt?`, `appearanceAnchor` = derived, `appearanceDerived:true`, `promptKey:'illustration-compose'`.
  - Run: `model_calls` has one compose row and one image row (`role=image`; `attempt` is the retry index, so 0 when the provider answered first try). Cost is visible only on the image row.
  - Run context is not linked: `GET /runs/<id>/context` returns 404 `CTX_001`. Use `context_packs where purpose='illustration'` for the input (sections `premise`, `subject_card`, `world_facts`, `art_style` if present).
  - **Quality:**
    - The prompt is comma-separated descriptive phrases (no sentences addressed to the model). It says none of "novel", "chapter", "illustration".
    - It is framed as a portrait or half-body study that reads at thumbnail size, includes your instruction, and is consistent with Wren's canon (age, apprentice, no invented scars). It reveals nothing from the SECRET fact.
    - The two candidates differ but show the same character. The character matches the derived appearance across candidates.
- **Fails when:**
  - 500 `AI_006`: `AI_OPENROUTER_API_KEY` missing — compose runs first, so this is what a missing key actually shows; the image path's `AI_004` is effectively unreachable. `AI_005`: provider failure after retries (see the error row in `model_calls.error`). `AI_010`: more references attached than the image model accepts.
  - 400 `ILL_006`: subject key missing (chapter key must be digits).
  - The composer output ignores the appearance or instruction (inspect the compose call's `rawOutput`).

#### 2.2 Refine, select, save (and reference handling)

- **Entry:** UI: open the illustration → add an instruction, pick a candidate, "Save as …". API `POST /illustrations/:id/refine`, `/select`, `/save`, `/discard`, `PUT /illustrations/:id/references`, `GET /illustrations/reference-options`.
- **Preconditions:** 2.1 illustration `$I` (status `active`).
- **Run:**
  1. `POST /illustrations/$I/refine {"add":"warmer palette, a brass lantern in her left hand"}`.
  2. `POST /select {"ref":"<a candidate ref>"}`.
  3. `POST /save {"target":"portrait"}`.
  4. Start a second portrait for the same entity.
- **Verify:**
  - Refine: `revision:2`, 4 candidates total, `selectedRef:null`, `instructions` has 2 entries. The body must carry exactly one of `add|removeIndex|replace` — the DTO is `minProperties:1, maxProperties:1`, so zero or two keys is a plain schema 400 and `ILL_007` may never be reachable over HTTP; a bad index is `ILL_008`. New candidates carry a different `instructionsHash`.
  - The edit source rides along as an image-to-image reference (`references[].role='edit-source'`, `reason:'auto:edit-source'`). It is `selectedRef ?? the newest candidate` — in the order above nothing is selected yet, so it is the last candidate; select first if you want to steer which one. The image model accepts only 1 reference (`maxInputReferences:1`), so other auto references are dropped and reported in `referenceWarnings` (returned, never persisted). Attaching more than capacity gives 400 `ILL_011`.
  - Save with no selection returns 400 `ILL_003`; a ref not in this illustration `ILL_004`; wrong target for the subject (`chapter` on an entity) `ILL_005` — but the no-selection check runs first, so a wrong target on an unselected illustration reads `ILL_003`; act on a saved or discarded one `ILL_002`.
  - After Save: `illustrations.status='saved'`; `entities.image_path=<ref>` (target `portrait`); target `gallery` adds an `entity_images` row. Unselected candidate objects are deleted from storage (their URLs stop resolving) unless another record references them. Discard deletes all unreferenced candidates.
  - Second portrait: `references[0]` has `reason:'auto:entity-portrait'`, `role:'likeness'` (the saved portrait is sent as a likeness reference) and the new anchor is the entity's `appearance` (if you PATCHed it) rather than re-invented.
  - **Quality:** after refine, the new pair reflects the added lantern and palette while keeping the face and outfit of the selected candidate. Judge whether re-rolls stay the same character.
- **Fails when:** the refined images ignore the edit source (provider ignores references; the anchor should still hold the subject), or a saved image URL 404s (storage deletion of a still-referenced ref).

#### 2.3 Chapter scene

- **Entry:** UI Start → "A chapter scene", Chapter number. API `subjectType:'chapter', subjectKey:'<n as digits>'`, save target `chapter`.
- **Preconditions:** chapter `n` is finalized in `chapters` with a `summary` and `entity_appearances` rows (produced by the generation and finalize recipes). A plain draft does not count.
- **Input:** `instruction`: `the single most tense beat, low angle, tide rising through the gate`.
- **Verify:**
  - Pack (DB) has `subject_card` = "Chapter n: title + summary" and `cast_appearance` with the appearance of every entity that has an `entity_appearances` row for the chapter (up to 3 character portraits are considered as auto likeness references; with capacity 1 the first is attached and the rest are trimmed with warnings).
  - Prompt names the on-page cast and one charged beat. Save target `chapter` adds a `chapter_images` row (`GET /chapters/n/images`).
  - **Quality:** the scene is one visually charged beat from THAT chapter, not a generic harbour.
- **Fails when:** silent generic output: with no `chapters` row for that number the subject card is absent and the composer sees only the premise. There is no error (`chapterSubjectSections` returns `[]`; it checks row existence, not status, so a row with a null summary still yields a bare "Chapter n: title" card). Check that `context_packs.sections` contains `subject_card`.

#### 2.4 Cover

- **Entry:** UI Start → "The project cover". API `subjectType:'cover'`, no `subjectKey`; save target `cover`.
- **Preconditions:** premise on the project; optional bible document `project/art-style` (see input).
- **Input** (art-style document body via the bible recipe, then start): `Medium: gouache. Palette: slate blue, salt white, one lantern amber. Line: soft, no outlines. Mood: melancholy, luminous.`
- **Verify:**
  - Pack has `art_style` and `premise` sections and nothing else. `styleNotes` should restate the medium, palette and mood — the prompt says it must follow the art-style document verbatim when one exists, but this is model behaviour, so judge it rather than assert it.
  - Framing leaves deliberate negative space at the top for the title, and a silhouette that survives thumbnail size. Save `cover` sets `projects.cover_image_path`.
  - Without the art-style document the composer picks a style that fits the genre and says so. Uploaded covers have `origin:'uploaded'` and refine by image-to-image only.
  - **Quality:** view the candidates at 150 px; the composition should still read.
- **Fails when:** the palette drifts from the art-style document, or text and lettering baked into the image.

---

### 3. Per-novel plugins

Off unless `PLUGINS_DIR` (`plugins.dir`) points at a directory whose children are `<plugin-id>/manifest.json` plus `index.js|index.ts` (default export `createPlugin(host)`). Loaded once at boot. The manifest returned by `manifest()` must deep-equal `manifest.json`. Only `augmentCanon`, `decideBriefPolicy`, `decideWriterClass`, `contributeContextSections`, `contributeSystemMessages` (and `onLoad`/`onEnable`/`onDisable`) are ever called.

Sample plugin (create `$PLUGINS_DIR/harbor-lens/`):

```json
{
  "id": "harbor-lens",
  "version": "1.0.0",
  "title": "Harbor Lens",
  "description": "QA plugin",
  "decisionPoints": ["canon.augment", "brief.policy", "call.route", "context.contribute", "prompt.contribute"],
  "exclusive": ["brief.policy", "call.route"],
  "forms": {
    "settings": {
      "fields": [
        { "name": "markedChapters", "type": "string", "title": "Marked chapters" },
        { "name": "noteText", "type": "string", "title": "Note text", "widget": "textarea" },
        { "name": "addFact", "type": "boolean", "title": "Add fact" },
        { "name": "raisedRole", "type": "string", "title": "Raised role" }
      ],
      "required": ["noteText"]
    }
  }
}
```

```js
import manifest from './manifest.json';
const marked = c =>
  new Set(
    String(c.markedChapters ?? '')
      .split(',')
      .map(s => Number(s.trim()))
      .filter(Number.isFinite),
  );
export default function createPlugin() {
  return {
    id: 'harbor-lens',
    manifest: () => manifest,
    augmentCanon: ctx => (ctx.config.addFact ? [{ op: 'fact.upsert', factKey: 'harbor-lens-note', body: ctx.config.noteText, rationale: 'plugin test' }] : []),
    decideBriefPolicy: ctx =>
      ctx.briefs.filter(b => marked(ctx.config).has(b.chapter)).map(b => ({ op: 'brief.update', chapter: b.chapter, writeMode: 'external', rationale: 'marked chapter' })),
    decideWriterClass: ctx => (ctx.role === ctx.config.raisedRole || (ctx.chapter !== undefined && marked(ctx.config).has(ctx.chapter)) ? 'permissive' : undefined),
    contributeContextSections: ctx => [{ key: 'note', title: 'Harbor note', rendered: ctx.config.noteText, segment: 'volatile', minWriterClass: 'standard' }],
    contributeSystemMessages: ctx => (ctx.role === 'chat' ? [{ role: 'system', content: 'End every reply with the single word HARBOR.' }] : []),
  };
}
```

#### 3.1 Load, list, enable with config validation

- **Entry:** UI Project Settings (`/novels/$novelId/settings`) → Plugins tab (only present when a plugin is installed); API `GET /plugins`, `GET|PUT|DELETE /projects/:p/plugins[/:pluginId]`.
- **Run:**
  1. Unset `PLUGINS_DIR`, boot, `GET /plugins` (expect `[]`); Plugins tab absent.
  2. Set it, restart, `GET /plugins`.
  3. `PUT /projects/$P/plugins/harbor-lens {"config":{"noteText":"The harbour bell rings twice at low tide.","addFact":true,"raisedRole":"illustration"},"ordinal":0}`.
  4. Negative bodies: `{"config":{}}`; `{"config":{"noteText":"x","bogus":1}}`; `{"config":{"noteText":"x","addFact":"yes"}}`.
  5. `DELETE`.
- **Verify:**
  - Step 2 lists the manifest (`decisionPoints`, `exclusive`, `forms.settings`); boot log "plugins loaded" `{ids:[harbor-lens]}`. A broken plugin logs `plugin skipped` with the reason (id/dir mismatch, manifest disagreement, no default export, and so on) and the others still load.
  - Step 3 returns 200 `{pluginId,pluginVersion:'1.0.0',config,ordinal:0,installed:true,needsReview:false,enabledAt,updatedAt}`; `project_plugins` row. `DELETE` returns 204.
  - Step 4: each is 400 `PLG_003` ("required", "not a declared setting", "must be a boolean"). Unknown plugin id gives 404 `PLG_001`. A second plugin that also claims `brief.policy` or `call.route` exclusively gives 409 `PLG_004`.
  - Bump `version` in the manifest and restart with a saved config that no longer validates: `needsReview:true` and the plugin contributes nothing until re-saved.
  - A plugin whose folder is removed: `installed:false`, kept but inert (UI "Not installed on this deployment").
- **Fails when:** Plugins tab appears with no plugin dir, enable succeeds with a bad config, or `PLG_002` is returned for an enabled plugin.

#### 3.2 `canon.augment`

- **Entry:** UI Plugins tab "Suggest canon" style button, or `POST /projects/$P/plugins/harbor-lens/augment`. Also runs automatically after a completed bible build (`POST /seed-from-brief`) for every enabled plugin.
- **Preconditions:** 3.1 enabled with `addFact:true`.
- **Run:** call augment twice; then set `addFact:false` and call again.
- **Verify:**
  - 200 `{proposalId}`. `GET /proposals/<id>`: `kind:'plugin'`, `scopeType:'project'`, `scopeRef:'harbor-lens'`, summary "Canon augmentation from Harbor Lens", `changeSet:[{op:'fact.upsert',factKey:'harbor-lens-note',body:<noteText>,rationale}]`. The UI shows a plugin source chip; nothing lands until applied.
  - The second call supersedes the first (`superseded`) — superseding is scoped to pending proposals from the same plugin whose change-set refs overlap, so two non-overlapping plugin proposals legitimately coexist. `addFact:false` gives 204, as does an enabled-but-`needsReview` plugin.
  - A plugin cannot issue `action.*` or any op outside the plugin allowlist (entity/fact/bible_document/brief.update/arc.upsert…); such output gives 400 `PLG_005` and stages nothing. Moving an existing arc to another volume is also `PLG_005`.
  - Not-enabled plugin gives 404 `PLG_002`.
- **Fails when:** the proposal writes domain tables before apply, or a second augment leaves the first pending proposal un-superseded despite touching the same refs.

#### 3.3 `context.contribute` and `prompt.contribute` (cheap, via the hub)

- **Entry:** any hub turn (the plugin policy is resolved with `role:'chat'`).
- **Preconditions:** 3.1 enabled, plugin note set.
- **Input:** `What is one sentence you can tell me about the Memory Tithe?`
- **Verify:**
  - Context: `GET /runs/<id>` `contextPack.sections` includes key `plugin:harbor-lens:note` (tier `working`, segment `volatile`); `/context` `rendered` contains "Harbor note" and the note text. It appears because `minWriterClass:'standard'`. Change it to `'permissive'` and it must vanish (fail-closed; missing or invalid value also withholds).
  - Prompt: the reply ends with `HARBOR`. The system message is NOT in the pack or the debug `input`; the only durable trace is `model_calls.plugins = [{"id":"harbor-lens","version":"1.0.0","configHash":"…"}]` and `policy_digest` (DB only).
  - Plugin-free calls in the same run family (`chat-title`, `chat-compact`) have `plugins NULL` unless they also got a policy; disabled plugin gives `plugins NULL` and no HARBOR.
  - Cache key includes the policy digest, so a plugin-shaped cacheable response is never served to another novel (`model-router.service.ts:hashRequest`).
- **Fails when:** the section shows for a `permissive`-only contribution on a standard call, the stamp is missing on a plugin call, or a plugin throw fails the turn.

#### 3.4 `call.route` and `brief.policy`

- **Preconditions:** 3.1 with `raisedRole:"illustration"`, `markedChapters:"1"`; project `contentMode` standard.
- **Run (call.route, cheap):** start an entity illustration (2.1) with the plugin enabled, then again disabled.
- **Verify (call.route):**
  - Enabled: the `illustration-compose` row's `model` is `deepseek/deepseek-v4-pro` (unrestricted helper default) instead of `openai/gpt-5.6-luna`. `plugins` stamp set. Raise-only: a novel already `unrestricted` cannot be lowered.
  - For generation roles a raised call also writes `generator:'unrestricted'` and `isolated:true` on the draft and chapter, sticky for the run (see the generation recipe; `chapter-generation.graph.ts:248`). The image call is not routed by the plugin (`images()` takes no policy).
- **Run (brief.policy):** outline an arc whose range includes chapter 1 (planning recipe).
- **Verify (brief.policy):**
  - A pending proposal summary "Brief policy from harbor-lens", `changeSet:[{op:'brief.update',chapter:1,writeMode:'external'}]`; the briefs are already written (the planner is nudged, not compelled). Applying it sets `briefs.write_mode='external'`, which halts a batch generate at that chapter until finalized.
  - Only the first plugin (ordinal order) answers; a second answering plugin is ignored with a warning.
- **Fails when:** the model does not change on the raised role, or `write_mode` is set without a proposal.

#### 3.5 Failure isolation

- **Run:** edit `index.js` so `contributeSystemMessages` and `contributeContextSections` do `throw new Error('boom')` (or `augmentCanon`), restart, repeat 3.3 and 3.2.
- **Verify:** the hub turn still succeeds with a normal reply and no plugin section; the server logs warn "plugin decision point threw — contribution dropped" `{pluginId,point,reason}` for the policy hooks, and "plugin decision point failed — contribution dropped" for `augmentCanon`/`decideBriefPolicy`; augment returns 204 (`collect` swallows the error). A generation run is never failed by a plugin.
- **Fails when:** any 5xx or a failed run caused by a plugin hook.

---

### 4. Per-account AI settings and model groups

#### 4.1 Settings, precedence and routing

- **Entry:** UI Settings (`/settings`, "Your defaults for every project and idea you own"; rows Ideation studio / Writing / Planning & canon / Review & QA / Refinement chat / Fast helpers / Illustrations; "Save changes"; alert "Unrestricted projects"). API `GET /ai/models`, `GET|PUT /ai/settings`, `PATCH /chat/sessions/:s/model`, `PATCH /projects/:p {"config":{"models":{…}}}`.
- **Input:** `PUT /ai/settings {"models":{"chat":{"provider":"openrouter","model":"anthropic/claude-haiku-4.5"},"helper":{"provider":"openrouter","model":"openai/gpt-5.4-mini"}}}`.
- **Run:**
  1. `GET /ai/models` → note `profile:'production'`, `defaults` per group and prices.
  2. PUT as above (the body REPLACES the whole set; groups left out revert to platform defaults).
  3. Hub turn (new chat) then check its `model_calls`.
  4. Pin: `PATCH /chat/sessions/$S/model {"provider":"openrouter","model":"z-ai/glm-5.2"}`, turn again; clear with both null.
  5. Project override: `PATCH /projects/$P {"config":{"models":{"chat":{"provider":"openrouter","model":"openai/gpt-5.6-luna"}}}}`, turn.
  6. Negatives: an LLM model in `image`, a registered model with the wrong provider, an unknown id.
  7. Set project `contentMode:'unrestricted'` and repeat with the haiku default.
- **Verify:**
  - Step 3: the chat call's `model` is haiku and `chat_messages.model_id` (assistant) matches; the title call's `model` is gpt-5.4-mini (helper group).
  - Precedence exactly: chat pin > project setting > your default > platform default (UI shows this ladder). Step 4 uses the pin, then falls back after clearing; step 5 beats the account default but loses to a pin.
  - Step 6: each is 400 `AI_002`; the `image` group needs an image model and other groups an LLM (`account-settings.service.ts`).
  - Step 7: an account pick not on the unrestricted allowlist (`x-ai/grok-4.6, deepseek/deepseek-v4-pro, z-ai/glm-5.2, moonshotai/kimi-k3`, image `x-ai/grok-imagine-image-2.0`) is ignored; the project uses the unrestricted default (chat `z-ai/glm-5.2`). A chat pin is filtered the same way on an unrestricted project. `GET /ai/models` `unrestrictedAllowlist`/`unrestrictedDefaults` show the lists.
  - Group→role mapping: Illustrations compose runs on the helper group (not Planning); embedding and vision are not configurable.
  - Account `planning` does NOT drive chat (the router folds `plan` into `chat` only at project level, not for account defaults). Test: set only `planning` → chat still uses the platform chat default.
- **Fails when:** a stored account model later leaves the registry: it is skipped (platform default) with no error, by design; a project override with an unregistered id gives 400 `AI_002` at call time.

---

### 5. AI quota and spend limits

#### 5.1 Rate and spend ceilings (per owner, rolling window)

- **Entry:** operator env `AI_QUOTA_MAX_CALLS` (default 1000), `AI_QUOTA_MAX_COST_USD` (default 50), `AI_QUOTA_WINDOW_MS` (default 3600000) — `bootstrap.ts:53-55`, documented in `.env.example:32-34`. `<=0` disables a limit dimension; a `<=0` window does not disable anything, it just makes the window empty. Restart to apply. The chat failure copy reads "Too many model calls right now" (`AI_008`) and "AI spending limit reached" (`AI_009`) (`novel-forge-web/src/components/nf/TurnStatus.tsx:39-40`).
- **Preconditions:** a fresh owner or project; `AI_QUOTA_MAX_CALLS=4`, `AI_QUOTA_MAX_COST_USD=0`, `AI_QUOTA_WINDOW_MS=600000`.
- **Run:**
  1. Two manual hub turns (first turn writes 2 rows: chat plus title; second 1 row = 3).
  2. Send a third turn; if it succeeds (4 rows), send a fourth.
  3. For spend: `AI_QUOTA_MAX_CALLS=0`, `AI_QUOTA_MAX_COST_USD=0.005`, restart; run turns until it trips.
  4. Create a second project of the same owner and send a turn.
- **Verify:**
  - The call that would exceed it returns 429 `AI_008` (rate) or `AI_009` (spend); comparison is `>=` (at the limit the NEXT dispatch is refused). No model row is written for the refused call.
  - The refused turn: user message persisted, run `status='failed'`, `error.code='AI_008'`; `GET /chat/sessions/$S/messages` returns `failedTurn.code='AI_008'`; SSE gives an `error` frame with the same code.
  - Rate counts every `model_calls` row in the window across ALL the owner's projects (repair rows and transport-error rows count; cache hits write no row, so they do not). Spend is `Σ recorded cost_usd` (image) plus `Σ tokens × registry price` for rows where `cost_usd IS NULL`, with cached input tokens billed at full price. Check by hand with 0.5's formula and compare to the point where 429 begins.
  - The check runs once per top-level call and BEFORE the `llm_cache` lookup, so at the limit even a would-be cache hit is refused.
  - Step 4: the second project is blocked too (per owner). A project with no owner id is never limited. After the window elapses (or with a smaller window) calls resume.
  - `chat-title` and helper calls are gated the same way; the refused title call is silent.
  - Read failure fails OPEN (warn "AI quota check skipped — usage read failed (fail-open)"), by design.
- **Fails when:**
  - Refused at count N-1 (off by one), or the second project not blocked.
  - Spend never trips for an unpriced model: unknown or unpriced models contribute 0.
  - Image spend is counted only when the provider returns `usage.cost`; otherwise it is 0 because image models have no registry price.

---

### 6. Code/doc mismatches and broken or unreachable behaviour

1. **Text cost is never recorded.** `ai/telemetry.handler.ts:165,197` inserts no `costUsd`; only `ai/model-router.service.ts:534` (image) sets it. So `GET /ai-usage.totalCostUsd`, the Overview "AI Usage & Cost" tile (`novel-forge-web/src/routes/novels/$novelId/overview.tsx:438`) and the Runs "Cost" column understate to image-only spend. The quota estimator does price text.
2. **`model_calls.status` enum is mostly dead.** `parse_error`, `repaired`, `refused` and `timeout` are never written (enum at `src/database/schemas/ai.ts:42`). The Runs UI "repaired" chip can never show; a repaired call is an `attempt=1` row with `ok`.
3. **`novel-forge:admin` cannot be granted at all today.** It is absent from `auth/role-catalog.constants.ts` and from identity's `ecosystem-seed.constants.ts`; identity's admin API can only assign existing roles, and the boot catalog sync deletes any permission or role hand-seeded beside the manifest. It is also not a registered OAuth scope, so the UI's scope gate can never pass even once the PDP gate does. See 0.1 for the code-change path.
4. **`GET /projects/:p/cost` is a stub.** `project/project/project.service.ts:434` always returns `{estimate:null,message:'AI module not yet initialized'}`.
5. **Illustration runs have no linked context pack.** `/runs/:id/context` returns 404 `CTX_001`; the pack is only in `context_packs`. `chat-title`/`chat-compact` are also not listed in `GET /runs`.
6. **Dead plugin API surface.** Manifest `actions` and the hooks `invoke`, `onEvent`, `registerPrompts` and `contributeWritingKnobs` are declared but never called (`plugin-policy.service.ts` hard-codes `knobs: {}`).
7. **Unused error codes.** `CHT_004`, `CHT_005` and `AI_003` are never thrown anywhere in the server, though the web app still maps `AI_003` to failure copy. Lookup-budget exhaustion is silent. `RFN_008`'s message ("Action execution failed — see the per-op results on the proposal") does not match its use (`proposal-apply.service.ts:246`: no executor registered).
8. **Proposal hand-edit skips the scope allowlist.** `proposal.service.ts:184` `updateChangeSet` calls `validateOps(kind, changeSet)` with no `allowedOps`, so a hub proposal can be hand-edited to carry any op in the global list, `seed.update` included. (Plugin proposals keep their own allowlist.)
9. **Auto-apply conflict leaves `conflicted`, not `pending`.** The `autoApply` doc comment says pending (`chat.service.ts:503`); the conflict status flip commits inside `apply`, so the reloaded proposal is `conflicted`.
10. **`GET /context/preview` persists a pack for every purpose except `generation`.** Only the `generation` branch passes `dryRun` (`refine.service.ts:255`); `outline`, `chat`, `arc_plan`, `premise` and `audit` all insert a `context_packs` row (deduplicated by hash).
11. **Stale comments.** `ai/defaults.ts:79` says the ideation studio has no settings screen, but `/settings` has an "Ideation studio" row and `ideation` is in `ACCOUNT_MODEL_GROUPS`. `chat.tsx:404` claims the server's `failedTurn` query "never picks up a `cancelled` run at all"; it does (`chat.service.ts:389` matches `['failed','cancelled']`).
12. **Product doc.** `novel-forge.md` matches the code on hub, proposals, plugins and quota. One gap: the doc says every call logs `promptKey@promptVersion`, true for `model_calls`, but no API returns the full prompt (0.3).
