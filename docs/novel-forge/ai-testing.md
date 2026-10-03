# AI testing

Manual test recipes for every AI feature of Novel Forge: the input to use and what to verify, so you can tell whether a feature works as intended. Recipes come from reading the code, not from running it; anything marked UNVERIFIED could not be confirmed.

## How to use this doc

1. Do Part 1 (setup) once: services, environment, authentication and how to read what the harness sent.
2. Run recipes in order within a part. Later recipes assume the project state earlier ones create; each block names its preconditions.
3. "The harness" means the AI orchestration around the models: prompts, context packs, LangGraph graphs, judge and repair, and model routing.

| Part                                  | Features                                                                                                              |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Part 1: setup and observability       | Run locally, AI env vars, auth, project creation, reset between runs, observability                                   |
| Part 2: lore bible                    | Premise enhancement, bible builder, readiness, audit, proposal-only writes, one end-to-end sample                     |
| Part 3: planning, generation          | Volumes, chapter plans, chapter generation, judge and repair, revise, finalize, continuity, validation, insert, amend |
| Part 4: novel import                  | Importing a finished manuscript as a new novel                                                                        |
| Part 5: chat hub and admin inspection | Chat hub, illustrations, plugins, AI settings and quota, admin inspection (runs, context packs, model calls)          |
| Part 6: the chat-first flow           | New novel and progress, organise, quote rule, rejections, plan cards, finalize review, passages, isolation, portraits |

## Recipe format

Each block gives: Entry (UI screen or route), Preconditions, Input (literal text to paste), Run, Verify (UI, database rows, run and model-call evidence, plus a quality check a human can judge) and Fails when (symptoms and where to look).

## Known gaps that affect testing

Several features are reachable only through the API, and some observability is incomplete; each recipe says so where it matters. The most important:

- Premise enhancement and `POST /validate` have no web caller; `POST /finalize` is called by the web only for a chapter
  approved before finalize reviews existed (every other finalize goes through `…/drafts/:n/finalize-review/finalize`).
- Manual chat sessions are made through the API (`POST /chat/sessions {"mode":"manual"}`) or by choosing **Ask first** in the composer's mode menu.
- `novel-forge:admin` (role `NovelForgeAdmin`, never default or bot-grantable) is needed to read prompts, context packs
  and raw model output; a platform role admin must assign it to you.

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

| Piece                          | Required for                  | Hard-fails without it?                                                                                                                              |
| ------------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Postgres 16+ **with pgvector** | everything                    | yes — `generated/drizzle/0000_initial_schema.sql:1` is `CREATE EXTENSION IF NOT EXISTS vector;`; `chapter_chunks`/`lore_chunks` hold `vector(1024)` |
| `novel-forge-server` on :8080  | every API call                | yes                                                                                                                                                 |
| `novel-forge-web` on :3000     | UI recipes only               | no — every recipe has an API path                                                                                                                   |
| An **identity** deployment     | booting the server at all     | **yes** (see §3)                                                                                                                                    |
| `AI_OPENROUTER_API_KEY`        | every chat/image model call   | yes — `AI_006` / `AI_004`, `src/classes/app-error-code.ts:97,99`, thrown at `src/modules/ai/model-router.service.ts:280-281` and `:487-488`         |
| Ollama on :11434               | lore/prose vector search only | **no — it degrades silently** (§6)                                                                                                                  |

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
| server        | `cd apps/novel-forge-server && bun run dev` | 8080 | `apps/novel-forge-server/package.json:8` (`bun run --watch src/main.ts`); `src/bootstrap.ts:40-41` |
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
`packages/common/src/services/config.service.ts:318-319`; the path is also `scripts/gen-api-types.ts:41` and `packages/modules/src/testing/openapi-dump.ts:31`).
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
(`src/modules/generation/generation.controller.ts:308-309,323-324,330-331`), so **your test user must be an
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

| Env var                       | Default                                          | Declared                                    | What it changes                                                                                                                                    |
| ----------------------------- | ------------------------------------------------ | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                    | `development`                                    | `config.service.ts:96`                      | the real dev switch: gates OpenAPI, the health port, and the `LOG_LEVEL` default                                                                   |
| `APP_STAGE`                   | `prod`                                           | `packages/common/.../config.service.ts:105` | changes nothing here — its only reader is `Config.isProductionDeployment()` (`:333-334`), which no `novel-forge-server` or `packages/*` path calls |
| `LOG_LEVEL`                   | `debug` when `NODE_ENV=development`, else `info` | `config.service.ts:107`                     | **keep it `debug`** — the full prompt input and raw output only ride on debug (§7)                                                                 |
| `SERVER_PORT` / `SERVER_HOST` | `8080` / `0.0.0.0`                               | `bootstrap.ts:40-41`                        |                                                                                                                                                    |
| `DATABASE_POSTGRES_URL`       | `…@localhost:7070/novel_forge` in the example    | `.env.example:14`                           | pgvector required; `src/migrate.ts:15` falls back to the same DSN without the port                                                                 |
| `AI_OPENROUTER_API_KEY`       | —                                                | `bootstrap.ts:43`                           | **every** chat and image model; absent → `AI_006`                                                                                                  |
| `AI_OPENROUTER_API_URL`       | `https://openrouter.ai/api/v1`                   | `bootstrap.ts:44`                           | point at any OpenAI-compatible gateway                                                                                                             |
| `AI_OLLAMA_HOST`              | `http://localhost:11434`                         | `bootstrap.ts:45`                           | embeddings only                                                                                                                                    |
| `AI_EMBEDDING_MODEL`          | `qwen3-embedding:0.6b`                           | `bootstrap.ts:46`                           | **pinned to 1024 dims** by the `vector(1024)` columns — do not swap (`qwen3-embedding:8b` emits 4096 and fails every insert)                       |
| `AI_MODEL_OVERRIDE`           | —                                                | `bootstrap.ts`                              | local-model test environments only — see below; unset is inert                                                                                     |
| `AI_STRUCTURED_OUTPUT`        | `prompt`                                         | `bootstrap.ts`                              | `prompt` \| `json-schema` — see below; `prompt` is inert                                                                                           |
| `AI_LLM_TIMEOUT_MS`           | `300000`                                         | `bootstrap.ts:47`                           | per-call budget (`model-router.service.ts:186`)                                                                                                    |
| `AI_LLM_MAX_RETRIES`          | `2`                                              | `bootstrap.ts:48`                           | **transport** retries only → 3 attempts (`model-router.service.ts:609-630`)                                                                        |
| `AI_LLM_BACKOFF_MS`           | `500`                                            | `bootstrap.ts:49`                           | exponential                                                                                                                                        |
| `AI_QUOTA_WINDOW_MS`          | `3600000`                                        | `bootstrap.ts:50`                           | rolling window, per project owner                                                                                                                  |
| `AI_QUOTA_MAX_CALLS`          | `1000`                                           | `bootstrap.ts:51`                           | **set `0`** locally                                                                                                                                |
| `AI_QUOTA_MAX_COST_USD`       | `50`                                             | `bootstrap.ts:52`                           | **set `0`** locally                                                                                                                                |
| `AI_LANGSMITH_API_KEY`        | —                                                | `bootstrap.ts:53`                           | **does nothing** — loaded but read nowhere in `apps/` or `packages/`, and LangChain ignores the `AI_` prefix (§7)                                  |
| `LANGSMITH_TRACING`           | `false`                                          | `.env.example:41`                           | LangChain's own switch — pair it with LangChain's own `LANGSMITH_API_KEY` (§7)                                                                     |
| `PROJECTS_MAX_PER_OWNER`      | `100`                                            | `bootstrap.ts:55`                           | `0` disables; breach → `PRJ_004`                                                                                                                   |
| `PUBLISHING_AUTO_PUSH`        | `true`                                           | `bootstrap.ts:57`                           | **set `false`** with no reader service                                                                                                             |
| `PLUGINS_DIR`                 | `''`                                             | `bootstrap.ts:59`                           | **leave empty** (§9)                                                                                                                               |
| `STORAGE_DRIVER`              | `s3` in the example                              | `.env.example:46`                           | **set `local`** off-cluster; declared by `StorageModule`, not `bootstrap.ts`                                                                       |
| `STORAGE_LOCAL_DIR`           | `./storage-data`                                 | `.env.example:58`                           |                                                                                                                                                    |
| `STORAGE_PUBLIC_ORIGIN`       | —                                                | `.env.example:47`                           | the origin image URLs are resolved against                                                                                                         |

#### Local-model test environments

Two settings exist so a test environment can serve every chat call from one small local model (Ollama's OpenAI-compatible
`/v1`, reached through `AI_OPENROUTER_API_URL`) and still get output the cards can render. Both are inert unless set: a deployment
that leaves them alone sends exactly the requests it always did.

- `AI_MODEL_OVERRIDE=<model id>` puts that one id on the wire for every chat call — structured, streamed, image-attached and the
  judge/validation tool loops — with `reasoning: { effort: 'none' }`, because Ollama maps any reasoning field to thinking. Routing,
  the registry checks (`AI_002`/`AI_003`), quota, `model_calls.model`, cost and `llm_cache` keys all keep the resolved id, so a spec
  learns which model a role routed to from `model_calls`, never from behaviour. The server refuses to boot (`AI_017`) when the
  override is set and `AI_OPENROUTER_API_URL` is unset or points at OpenRouter, so it can never re-route paid traffic. Image generation
  and vision are not local: images keep the logical image model and fail closed with `AI_005`, and an image-attached call reaches the
  text-only local model and fails closed with `AI_007`.
- `AI_STRUCTURED_OUTPUT=json-schema` also sends each structured call's schema as a grammar-constrained
  `response_format: { type: 'json_schema' }`, with change-set ops, the chat question card and `readerValue` typed there
  (`PromptModule.constrainedProperties`) — a small model cannot write them from the loose in-band schema. The in-band schema and every
  prompt are unchanged, and a constrained reply still goes through AJV, `postValidate` and the repair round like any other.

Two flows are never exercised in json-schema mode, so an e2e spec must not depend on them:

- **Chat lookups.** The chat turn's `lookups` is constrained to an empty array (`chat-refine.prompt.ts`), because a schema cannot keep
  lookups apart from a changeSet; a turn never fetches before it edits, and answers from the provided context only.
- **Judge and validation tool calls.** The grammar leaves the model no way to call a tool, so the judge and validation tool loops answer
  in one round from the pack they were given.

#### Model groups and defaults — there is no env var for these

Model selection is **code + database**, not environment.

- Roles → groups: `src/modules/ai/defaults.ts`. `bible`, `plan`, `outline`, `premise`,
  `extraction` all map to **`planning`**.
- Production group defaults (`defaults.ts:85-95`):
  `writing` → `anthropic/claude-sonnet-5`, `planning` → `anthropic/claude-opus-5.5`, `review` → `anthropic/claude-sonnet-5`,
  `chat` → `anthropic/claude-opus-5.5`, `helper` → `openai/gpt-5.6-luna`, `image` → `x-ai/grok-imagine-image-2.0`,
  `vision` → `openai/gpt-5.6-luna`, `embedding` → `ollama qwen3-embedding:0.6b`.
- Unrestricted map (`defaults.ts:101-111`) applies when `project.contentMode === 'unrestricted'`; overrides are
  clamped to `UNRESTRICTED_LLM_ALLOWLIST` (`defaults.ts:117`).
- Reasoning effort per group: `REASONING_POLICY` (`defaults.ts:142-152`) — every authoring group asks for `low`.
  **Watch out:** `resolveReasoningEffort` (`defaults.ts:157-165`) omits the field entirely when the model's
  registry entry does not list the policy effort and its mode is `optional`. `z-ai/glm-5.2` lists only
  `['xhigh','high']` (`src/modules/ai/models.ts:204`), so the default planning model runs with **reasoning off**.
- Registry of selectable models: `src/modules/ai/models.ts:41-247`. Every LLM id is an OpenRouter `vendor/model`
  slug and its `provider` must be `openrouter`.

Two ways to pick a model, in precedence order (`ModelRouterService.routeModel`):

1. **Per project, per role** — `PATCH /api/v1/projects/:id` with
   `{"config":{"models":{"bible":{"provider":"openrouter","model":"anthropic/claude-opus-5"}}}}`.
   Field list: `src/modules/project/project/project.dto.ts:52-...` (`ProjectModelOverrides`, `bible` at `:89-90`).
   Validated at write time by `isRegisteredModel` (`src/modules/project/project/project.service.ts:80-83`) →
   a wrong provider or unknown id gives `AI_002`.
2. Otherwise the platform model for the project's cost tier and model type (`COST_TIER_DEFAULTS`). A chat turn's tier
   outranks the project's. There is no per-account model default; `PUT /api/v1/ai/settings` `{"defaultCostTier":"economy"}`
   only sets the tier a new project starts on.

`GET /api/v1/ai/models` (`ai.controller.ts:26-54`) returns the whole registry with prices, context windows and both
default maps — the quickest way to see what is selectable.

`e2e/tests/novel-forge/forge-helpers.ts:67` exports `HAIKU_MODEL = {provider:'openrouter', model:'anthropic/claude-haiku-4.5'}`,
a registered id with the right provider — the helper that previously pinned an unregistered `anthropic/claude-haiku-4-5` id
(and would have 400'd with `AI_002`) has since been fixed; it is safe to copy.

---

### 5. Creating a project

`POST /api/v1/projects` — `src/modules/project/project/project.controller.ts:29` (201, `ProjectResponse`).

Body (`CreateProjectBody`): required `name` and `kind`; optional `title`, `instructions`, `contentMode`, `costTier` (omitted → the owner's default cost tier).

- `kind` has one value, `new_novel` (`src/database/schemas/projects.ts`).
- `contentMode`: `standard | unrestricted` (`projects.ts`).
- A create also inserts blank placeholder bible documents (`project.service.ts`); they carry no `contentHash`.

**Always send `kind: "new_novel"`**; it is the only value the enum accepts.

The bible builder (Part 2) reads the project brief, which neither create route writes — it is a separate `PATCH`:

```
PATCH /api/v1/projects/:id   {"brief": "<your premise>"}
```

(`project.dto.ts`). The Story Bible screen's builder button refuses to run without one
(`apps/novel-forge-web/src/routes/novels/$novelId/story-bible.tsx`, "Add a project brief in Settings before generating
the bible").

**UI equivalent:** `apps/novel-forge-web/src/features/projects/NewNovelModal.tsx` ("Start a new novel": an optional
working name — blank becomes "Untitled novel" — your notes up to 10,000 words, and the content mode) calls
`POST /api/v1/projects/new-novel` (`new-novel.controller.ts`), not `POST /projects`. One transaction creates the
project, stores the notes verbatim and opens an auto-mode chat; the response is `{projectId, sessionId}` and the web
queues the opening message into that chat. The Part 6 recipes start here. Continuing an existing manuscript is the
separate **Import novel** screen (Part 4). Screens are declared once in
`apps/novel-forge-web/src/components/Layout/screens.tsx` (`PROJECT_SCREENS`), and the visible labels are **Chat**,
**Overview**, **Story Bible**, **Chapters**, **Review Queue**, **Illustrations**, **Workflow Runs** (admin-only,
`adminOnly: true`), **Publish**, **Usage & charges**, **Project Settings**. Old links to retired screens
(`isRetiredScreen`) open the project's home. There is no standalone volumes screen and no standalone **Proposals**
screen: continuity and refinement proposals are both a view inside **Review Queue** (`review.tsx`).

**Content without AI:** `POST /api/v1/import` takes a hand-written `novel-import` bundle; a minimal valid one is
built by `buildFinalBundle` at `e2e/tests/novel-forge/forge-helpers.ts:110`. Useful when you need chapters to
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
ollama pull qwen3-embedding:0.6b && ollama serve   # must stay on :11434
```

and re-run the bible builder afterwards (indexing only happens during a run), or the previously written docs stay
unindexed. The repair rules differ by kind:

- **Lore** self-heals. `addLore` upserts on `(projectId, kind, refKey)` and writes `embedding` in the `set` clause
  (`indexing.service.ts:58-68`), so re-running the bible builder overwrites a null embedding in place.
- **Prose** heals on `POST /backfill`: it re-indexes every finalized, non-isolated chapter with no `chapter_chunks`
  row or with any chunk whose `embedding` is null (`addProse` deletes the chapter's chunks first). A chapter the
  embedder still cannot reach counts as `skipped`, and an amend or backfill reports a chapter indexed only when
  every chunk was embedded.

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

API (all three require `ADMIN_PERMISSION`, `highRisk` — `generation.controller.ts:308-309,323-324,330-331`):

- `GET /api/v1/projects/:id/runs` — run list (not admin-gated, `:301`).
- `GET /api/v1/projects/:id/runs/:runId` — status, outcome, `input`, `nodeTrace`, `modelCalls[]`, `toolCalls[]`,
  `contextPack` (`generation.dto.ts:731-777`).
- `GET /api/v1/projects/:id/runs/:runId/context` — the assembled pack plus `rendered`, the exact text supplied
  (`generation.dto.ts:716-720`).
- `GET /api/v1/projects/:id/runs/:runId/calls/:callId` — adds **`rawOutput`** and `error` (`generation.dto.ts:722-729`).
- `GET /api/v1/projects/:id/cost` — spend by group/role/model plus `byCostSource`/`byTier`/`byContentMode` breakdowns.

DB, when you are not an admin:

- `model_calls` (`src/database/schemas/ai.ts:77-110`) — `run_id, node, role, provider, model, prompt_key,
prompt_version, status, input_tokens, cached_input_tokens, output_tokens, latency_ms, cost_usd, attempt,
raw_output, error`. `raw_output` is persisted for every successful call
  (`src/modules/ai/telemetry.handler.ts:152-182`), so this is the honest record of what the model wrote.
- `context_packs` (`ai.ts:129-148`) — `purpose, budget_tokens, used_tokens, sections, unresolved_refs, omitted, rendered`.

**Caveat that trips people up:** the bible-builder graph never calls the context assembler — it passes prior stage
documents as plain prompt variables (`src/modules/ai/graphs/bible-builder.graph.ts:183-245`). So **a bible run has
no `context_packs` row** and `GET /runs/:runId/context` is empty for it. That is expected, not a bug.

LangSmith: **`AI_LANGSMITH_API_KEY` does not work.** `bootstrap.ts:53` loads `ai.langsmith.api.key` into the
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
| Clear drafts/briefs only                        | `POST /api/v1/projects/:id/reset {"stage":"generate"}`                                                      | `project.service.ts:328-338`                                              |
| Clear volumes                                   | `…/reset {"stage":"plan"}`                                                                                  | `project.service.ts:308-326`                                              |
| Clear entities/world facts                      | `…/reset {"stage":"knowledge"}`                                                                             | `project.service.ts:297-306`                                              |
| Wipe the DB                                     | `DROP DATABASE novel_forge; CREATE DATABASE novel_forge;` then `bun run db apps/novel-forge-server migrate` | no endpoint or script exists                                              |

**Two traps:**

1. `POST /:id/reset` with `stage: "all"` **does not delete `bible_documents` or `canon_facts`.** Read
   `project.service.ts:293-342` — `bibleDocuments` and `canonFacts` appear nowhere in it. So after a "reset all"
   the bible prose survives, and a `seed-from-brief` **without** `force:true` skips every stage
   (`bible-builder.graph.ts:73-81`) and returns `completed` having made zero model calls. If you are comparing
   bible outputs, the only clean baselines are **a fresh project** or **`force: true`**.
2. The UI cannot re-run the builder at all. The "Generate story bible" button lives inside the screen's
   `EmptyState` (`story-bible.tsx:505-518`) — once any entity exists the empty state is gone — and `runSeed` never
   sends `force` (`story-bible.tsx:210`). **Every re-run is an API call.**

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
ollama pull qwen3-embedding:0.6b   # then keep ollama running on :11434

# 5. run — two terminals, each starting from the repo root (the cds are not chainable)
(cd apps/novel-forge-server && bun run dev)    # terminal 1 — :8080
(cd apps/novel-forge-web    && bun run dev)    # terminal 2 — :3000, API_ORIGIN unset

# 6. authenticate (§3) — browser login needs a localhost redirect URI registered at your identity;
#    against the k3d cluster's identity there is none, so use a bearer token instead
# 7. create a project (kind new_novel) and PATCH its brief
```

---

### 11. Existing automated tests and eval scripts — what they do and do not prove

The model-backed evaluation suites live in `scripts/evals/novel-forge/` (its `README.md` says how to run them); they need `NF_EVAL_TOKEN`.

#### Commands

From `apps/novel-forge-server` (`package.json:7-16`) — these are the one exception to "every command runs from the
repo root", because they are the workspace's own scripts and Bun resolves `tests/` relative to the cwd:

```bash
bun test                # the whole suite — the workspace has no `test` script of its own any more, so
                         # `bun run test` errors "Script not found"; `scripts/verify.ts` falls back to plain
                         # `bun test` for it (no `--coverage`, default timeout) the same way
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

#### `tests/ai/prompts.spec.ts` (718 lines) — makes no model calls

It asserts prompt **wiring**: the `AUTHORING_STYLE` invariant across authoring-kind prompts (`:24-64`), the ending-contract,
judge, fix and bible-stage (characters) schema shapes, refinement-prompt module behaviour (cache strategy, scope
playbooks, lookup rendering), outline invariants, and `parseSchema` acceptance/rejection of hand-written payloads. It also
pins prompt copy as string-contains — the generation prompt must state a floor, aim and ceiling built from `WORD_TARGET_MIN`
/ `WORD_TARGET_AIM` / `WORD_TARGET_MAX` (`:404-419`), which it imports from the eval bands at `:19`, so the prompt text and
the metric band cannot drift apart.

**There is no hard-pinned-version test any more.** Version numbers surface only as informal labels on describe blocks
(`readability (judge v2.4, fix v1.3)`, `reader value and purpose (outline v2.3)`) — none of it asserts against
`PROMPT_REGISTRY[key].version`, and the labels themselves already lag the registry (judge is 2.4.0, fix 1.4.0 and outline
3.1.0 today). Read the version straight off `PROMPT_REGISTRY` or this doc's recipes, not off a describe-block name.

There is **no registry-completeness test**: the only registry-wide loops filter by `kind`. Most bible-builder stage
versions are **not** pinned anywhere; `tests/ai/bible-stage-contract.spec.ts` only checks the seven keys exist.
Coverage ignores `src/modules/ai/prompts/**` and `src/modules/ai/schemas/**`; `apps/novel-forge-server` no longer has its
own `bunfig.toml` (only some `packages/*` and the two other web apps do), so no coverage threshold is configured at all
for this workspace — a change in coverage behavior worth confirming is intentional rather than an accidental deletion.

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

Gated on `AI_SMOKE_SPEND` (`:14,30-39`): a bare `bun run ai:smoke` prints the model list and estimated cost and
exits 0 without spending. With the var set it exits 1 if `ai.openrouter.api.key` is missing (`:41-44`).

It builds a real `ModelRouterService` with stub telemetry/DB/quota (`:53-62`) and makes **4 live calls** —
`ROLES` at `:15` is `['bible','title','judge','generation']`, so on the production
defaults that is claude-opus-5.5, gpt-5.6-luna, claude-sonnet-5 ×2. Estimated at 1,500
in / 700 out per call (`:18-28`), roughly **$0.04** total. Assertions are shape-only: the foundation rung checks
`typeof result.body === 'string' && result.body.length > 10` (`:81`); the judge rung feeds an obvious canon
contradiction but accepts **either** verdict (`:105`).

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

**Proven for ~$0.04** (`AI_SMOKE_SPEND=1 bun run ai:smoke`): the production models behind four roles are reachable and return
schema-conformant output.

**Proven by nothing in the repo:** bible content quality; that a real model clears the entity floors; that real
chapters land in the length band or avoid stock phrases; judge accuracy (false positives or negatives); anything
cross-model, because **there is no fixed corpus, no golden output and no LLM-as-judge anywhere** — `grep` for
`toMatchSnapshot` in `tests/` returns nothing, and the only prose fixture is
`tests/fixtures/draft-body.ts`, a single sentence repeated 210 times to clear a word-count minimum.

Closing that gap needs a blind evaluation of real output against a baseline.

---

### Where the old README is wrong

| README said                                                    | Actually                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STORAGE_DRIVER` default `local`, `STORAGE_IMAGE_DIR=./images` | the driver is `s3` (Garage) in `.env.example:46`, and the key is `STORAGE_LOCAL_DIR` (`:58`); `STORAGE_IMAGE_DIR` no longer exists                                                                                                                          |
| the env table is the whole list                                | it omits `AI_LLM_TIMEOUT_MS`, `AI_LLM_MAX_RETRIES`, `AI_LLM_BACKOFF_MS`, `AI_QUOTA_*`, `PROJECTS_MAX_PER_OWNER`, `PUBLISHING_AUTO_PUSH`, `PLUGINS_DIR` (all in `bootstrap.ts:47-59`), and every `AUTH_*` var — without which the server does not boot       |
| "five LangGraph workflows"                                     | there are now six graphs in `src/modules/ai/graphs/` — the five listed plus mechanical-check                                                                                                                                                                |
| route table                                                    | routes have moved: the bible document route is `GET/PUT /projects/:id/bible/:section/:slug` (`bible-document.controller.ts:23,32`), volumes are read-only over HTTP (`GET /projects/:id/volumes[/:volumeKey]`), and many screens' routes did not exist then |
| `.env.example:13` "Run `bun run db:migrate`"                   | there is no `db:migrate` script in `apps/novel-forge-server/package.json`; use `bun run db apps/novel-forge-server migrate` from the root                                                                                                                   |

---

## Part 2: lore bible

Covers: premise enhancement, bible builder, bible readiness, bible audit, and proposal-only writes into bible
documents / entities / canon facts. The refinement **chat hub** (`/novels/$novelId/chat`) is covered in Part 5 (chat
hub and admin) — cross-referenced here where it is the only editor for something.

Everything below is read off current code in `apps/novel-forge-server` / `apps/novel-forge-web`.

### Shared setup

- All API paths are relative to the server host; every route below is `@Authenticated()` and needs
  `novel-forge:projects:read`, plus `novel-forge:projects:write` + `novel-forge:generation:run` on anything that
  spends a model call.
- `projectId` is a numeric string. There is no project status any more — a project is authorable from the moment it is created.
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

---

#### Premise enhancement (refine)

- **Entry:** `POST /api/v1/projects/{projectId}/premise/enhance` — **API only. UNREACHABLE from the web UI**: no
  component calls it (`apps/novel-forge-web/src/lib/apis/` has no `useEnhancePremise*` hook; the type exists only in
  `api-types.gen.ts:1618`). The `action.enhance_premise` op can reach it from the refinement chat hub
  (see Part 5).
- **Preconditions:** `status='active'`. Falls back to `projects.brief` then `projects.premise` when `overview` is
  omitted; when supplied, `overview` must be 10–200,000 characters.
- **Input:** `{"overview": "<the sample spark above>"}`
- **Run:** 1. POST. 2. Read the `rationale` fields. 3. Open **Review Queue**'s Proposals view (`/novels/$novelId/review?view=proposals`), review, apply.
- **Verify:** run `graph='premise-enhance'`, `target='premise'`, prompt `premise-enhance@1.2.0`, role `premise`;
  context pack `purpose='premise'` (project premise + a 1-line-per-doc inventory). The response's `rationale` object
  carries `enhancedPremise, hook, stakes, protagonistDrive, progressionSystem, serializationNotes, genre, themes`, and
  `proposal` is the staged change-set (`kind='premise_enhance'`, `scope_type='novel'`, allowed ops `premise.update`,
  `bible_document.upsert` only). Nothing is written until
  `POST /api/v1/projects/{projectId}/proposals/{proposalId}/apply`.
  **Quality:** the enhanced premise reads as back-cover copy in 2–3 paragraphs — it must **not** walk the arc and must
  **never** state the ending. Serialization machinery belongs in `serializationNotes`, not in the premise prose.
- **Fails when:** `PRM_001` (no overview and no brief/premise on the project);
  `model_calls.status='repaired'` with a `changeSet` postValidate failure (ops outside the two allowed types).
- **Cost:** 1 model call.

#### Bible builder (staged AI seed of the bible)

- **Entry:** **Story Bible** screen → **Generate story bible** (shown **only in the empty state**, i.e. when the project
  has zero entities); `POST /api/v1/projects/{projectId}/seed-from-brief`.
- **Preconditions:** none on the project. The API reads the brief from
  the **body only** and never touches `projects.brief`; the web button is what requires a non-empty `projects.brief`,
  and project creation does not write it — set it in **Project Settings → “Premise / brief”**
  first (see Findings).
- **Input:** `{"brief": "<the sample spark, plus: open-ended serial, single POV (Tin), low-fantasy river city>", "force": false}`
  (`brief` is required and unbounded; `force` is optional and defaults to false.)
- **Run:** 1. POST (the request blocks for the whole run — minutes). 2. Watch `GET …/runs` for
  `graph='bible-builder'`, `target='all-stages'`. 3. Read `GET …/bible` and `GET …/entities`.
- **Verify:** `node_trace` = `foundation, world, power, factionsAndLocations, characters, plot, volumes, indexLore`.
  Seven prompts, one per stage: `bible:foundation@2.0.0`, `bible:world@1.0.0`, `bible:power@1.0.0`,
  `bible:factions-locations@2.0.0`, `bible:characters@2.0.0`, `bible:plot@2.0.0`, `bible:volumes@2.1.0`. Each stage
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
  `project/cast` must name a protagonist, what opposes them and the relationships that generate conflict. The opposition
  may be a person, a faction or the situation itself — a survival story needs no antagonist — but a cast document that
  names no pressure at all is the classic weak output here.
- **Fails when:** repeated `model_calls` rows with `attempt=1` on one stage — the coverage floor was missed and the
  reply was retried; a stage silently skipped because its document already had a body (`project/premise`,
  `project/cast`, `world/setting-overview`, `power/system-and-limits`); `PRJ_001`; an HTTP timeout at the
  gateway while the run keeps going server-side (check `workflow_runs`, not the response).
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
- **Run:** 1. POST. 2. Read `findings[]`. 3. If a proposal came back, review it in **Review Queue**'s Proposals view and apply.
- **Verify:** run `graph='bible-audit'`, `target='bible'`, prompt `bible-audit@2.1.0`, role `audit`; context pack `purpose='audit'`
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
  (revert: `/revert`, discard: `/discard`; list: **Review Queue**'s Proposals view). Conversational refinement of an individual
  document or entity is the **refinement chat hub** (`/novels/$novelId/chat`) — covered in
  Part 5 (chat hub and admin).
- **Preconditions:** a pending proposal from premise-enhance, bible-audit, or a chat turn.
- **Input:** none for apply; `PATCH …/proposals/{id}` to select a subset of ops first.
- **Run:** 1. List proposals. 2. Apply. 3. Re-read the affected rows and the readiness score.
- **Verify:** `refinement_proposals.status` goes `pending → applied` (the other terminal values are `conflicted` when
  a baseline moved, `superseded`, `reverted` and `discarded`). The domain write and the status change are one
  transaction with a baseline conflict check —
  audit / premise / chat output must **never** appear in `bible_documents`, `entities` or `canon_facts`
  without a corresponding applied proposal. `bible_documents.revision` and `content_hash` move on every upsert that changes the body — an upsert
  whose `content_hash` is unchanged is a no-op and leaves the revision alone. Direct author edits stay available:
  `PUT /api/v1/projects/{projectId}/bible/{section}/{slug}`, `PATCH …/entities/{entityKey}`,
  `PUT …/facts/{factKey}` (+ `POST …/facts/{factKey}/reveal`).
  **Quality:** `GET …/changes` then `POST …/changes/rollback` must restore the previous body exactly — an applied
  proposal that cannot be reverted is a defect.
- **Fails when:** `RFN_009` on a blanket manual apply that includes `action.finalize`; status `conflicted` (the
  artifact moved under the proposal — expected, re-run the producer); `FCT_002` (a fact op names an unknown entity key);
  `ENT_001` / `DOC_001` / `FCT_001` on a removed target.

---

### End-to-end recipe — one small sample novel, stage by stage

Run this whole sequence once against the sample idea; keep the outputs and diff them against your baseline bible (a hand-written one, or one produced by a single prompt of your own). Total ≈ 18–25 model calls.

**Stage 0 — create the novel.** `POST /api/v1/projects` with
`{"name": "Untitled novel", "kind": "new_novel", "contentMode": "standard"}` (responds `201`).
☐ `projectId` returned ☐ `GET …/status` answers with zero chapters, drafts and volumes.

**Stage 1 — give the project a brief.** `PATCH /api/v1/projects/{projectId}` with
`{"brief": "<the sample spark plus: open-ended, single POV, low fantasy>"}` (or Settings → “Premise / brief”). The
bible builder's **UI button** is what needs it, so this stage is required to test the screen and optional if you only
drive `POST …/seed-from-brief` directly.
☐ `projects.brief` non-empty ☐ the Story Bible empty state now offers **Generate story bible** instead of **Add a
brief in Settings**.

**Stage 5 — readiness.** `GET …/bible/readiness`.
☐ read it once before the bible is built and keep it — the delta to Stage 7 is what the builder is worth
☐ `substance` judges only the roles a manifest document serves, against its word floor
☐ `readyToDraft` reads coverage + records only ☐ `blockingGaps` names each missing manifest chapter and each unmet
entity floor.
**Expect `substance: thin` while the bible is still a pitch, and do not treat it as a defect.** `project/reader-promise`
matches no manifest role, so it is only checked for placeholder text and counts for nothing; `project/premise` is the
`foundation` role and is judged against that role's 100-word floor (`ROLE_WORD_FLOOR`, `eval/bible-readiness.ts`). It
is non-blocking: `readyToDraft` is coverage + records only.

**Stage 6 — build the bible.** `POST …/seed-from-brief` with the brief, `force: false`. A stage whose document
already has a body **skips**, so run it on a fresh project to see every stage.
☐ `node_trace` has all 8 nodes ☐ a stage whose document already had a body reports `counts[stage] = 0` and still
appears in `stagesDone` ☐ all 7 manifest addresses present ☐ entity floors met (≥3 location/concept,
≥4 power_rule/concept, ≥4 faction/location, ≥3 character) ☐ character cards each have want + cost + a voice tic
☐ `lore_chunks` populated.

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

**Stage 10 — compare.** Export the seven manifest documents + the entity roster and diff against your baseline bible on: a named opposing pressure, a named cost for every power rule, per-character want/wound/voice, escalation stated per
volume, and whether anything in the bible prose spoils a `canon_facts` reveal.

---

### Findings — code vs product doc, and seams worth reporting

1. **Nothing writes `projects.brief`, and the bible builder's UI button reads only that.**
   Project creation does not set `brief`;
   `apps/novel-forge-web/src/routes/novels/$novelId/story-bible.tsx` refuses to run without one
   (`'Add a project brief in Settings before generating the bible.'`). The API itself takes the brief in the
   request body and never reads `projects.brief`, so this is a UI-path gap only.
2. **The bible builder reads no decision ledger.**
   `apps/novel-forge-server/src/modules/ai/graphs/bible-builder.graph.ts` templates take `projectBrief` plus
   previously written stage bodies only — it links **no context pack**, and never reads the decision ledger, canon
   facts, or `project/reader-promise`.
3. **`POST /api/v1/projects/{projectId}/premise/enhance` is unreachable from the web app.** Only
   `apps/novel-forge-web/src/lib/apis/api-types.gen.ts:1618` mentions it; no hook or component calls it (contrast
   `bible/audit` → `apps/novel-forge-web/src/lib/apis/refinement.api.ts:729` →
   `apps/novel-forge-web/src/routes/novels/$novelId/story-bible.tsx:193`). It is reachable via the chat hub's
   `action.enhance_premise` op.
4. **“Generate story bible” only exists in the empty state.** `apps/novel-forge-web/src/routes/novels/$novelId/story-bible.tsx:505-518`
   renders the button inside `EmptyState`, so once a single entity exists there is no UI path to a rebuild —
   `force: true` is API-only.
5. **`seed-from-brief` runs the whole 7-stage graph inside the HTTP request**
   (`apps/novel-forge-server/src/modules/generation/generation.service.ts:182`,
   `apps/novel-forge-server/src/modules/ai/graphs/workflow-run.service.ts:346`) with no job row unless a caller
   supplies `jobId`. Expect minute-scale requests and client timeouts that do not reflect the run's real outcome.

---

## Part 3: planning, generation, finalize

All paths are prefixed `/api/v1`. `:projectId` is the numeric id (string of digits). UI screen labels are
exactly as `apps/novel-forge-web/src/components/Layout/screens.tsx` declares them. Code citations are
basenames within `apps/novel-forge-server/src` (server) or `apps/novel-forge-web/src` (`.tsx`).

### Shared preconditions (continue the project Part 2 built)

- A project (`POST /projects` → `{name, kind:"new_novel"}`).
- A bible: `bible_documents` rows, `entities`, and (for the knowledge recipes) `canon_facts` — whatever the
  bible builder wrote or you added by hand.
  Check with `GET /projects/:projectId/bible/readiness` → `readyToDraft: true`, and the **Story Bible** screen.
- The `novel-forge:admin` permission for `GET /runs/:runId`, `/runs/:runId/context`, `/runs/:runId/calls/:callId`
  and the **Workflow Runs** screen — these are `@RequirePermission(ADMIN_PERMISSION, {highRisk:true})`
  (`generation.controller.ts:308,323,330`). Without it you cannot inspect the harness at all. See Part 5 §0.1 for
  how to actually get it granted.
- Volumes have no screen of their own — they group the **Chapters** list and are read-only over HTTP apart from
  `POST /volumes/:volumeKey/goal-met` (see "Volumes and chapter plans" below and Part 6).
- JSON payloads below are wrapped to fit the page. Rejoin the wrapped lines before sending — a break that
  falls inside a quoted string is not valid JSON.

### Sample material

These recipes continue whichever project you built — normally the sample idea
Part 2 (lore bible) tells you to reuse verbatim. If you instead want a standalone project for this
doc alone, seed it with:

> **The Tidewright's Ledger.** In Calder Quay, debt is paid in remembered years: a tidewright can lift a
> memory out of a debtor and sell it on. Amara Veil, an eighteen-year-old ledger-clerk, discovers her own
> childhood is missing from the city's books — because someone paid it out to buy her mother's silence.
> She apprentices herself to the wrecker who holds the withdrawal slip, intending to steal it back before
> the Salt Assize forecloses on the Quay itself.

Entity/fact keys below (`amara_veil`, `rook_calder`, `salt_assize`, fact `amara_is_the_pledge`) are
**illustrative** — the bible builder coins its own. Read the real keys off the **Story Bible** screen's
entity pages and **Secrets** tab and substitute them, because an unknown key is skipped in silence rather than
rejected: `applyBriefReveals` logs `brief reveals reference unknown keys — skipped` and ledgers nothing
(`bible/fact/knowledge-view.ts:195-203`), and an unresolvable `requiredContext` ref is dropped the same way.

---

#### Volumes and chapter plans

- **Entry:** the chat hub (`POST /projects/:projectId/chat/...`), staging `volume.upsert` and `brief.update` ops, or
  `PUT /projects/:projectId/briefs/:n` for one chapter (next recipe). Volumes have no planner and no approval
  step, and are read-only over HTTP.
- **Preconditions:** bible documents exist (Part 2).
- **Input (chat):** "Two volumes: the first ends when Amara gets into the ledger house, the second when she steals the
  slip back. Plan chapter 1: Amara copies the day's withdrawals and finds her own name crossed out."
- **Verify:** the proposal carries `volume.upsert` ops with `volumeKey`, `ordinal`, `title` and `objective` (the goal)
  only — `conflict`, `payoff`, `targetChapterCount`, `cast` and chapter ranges are refused as unexpected fields —
  and a `brief.update` for chapter 1 naming its `volumeKey`. After apply: `volumes` rows hold no range or status;
  `briefs.volume_key` decides which volume goal the chapter writer sees (`volume_objective` section).
  **Quality:** each volume goal is one concrete end state, not a mood.
- **Fails when:** a `volume.remove` for a volume a brief still names → `VOL_002`.

- **Entry:** `PUT /projects/:projectId/briefs/:n`.
- **Preconditions:** none — the route creates the brief when chapter `n` has none.
- **Input:**
  `{"title":"The Withdrawal Slip","body":"Amara copies the day's withdrawals. She must NOT learn who signed her own pledge.",`
  `"knowledgeContract":{"pov":["amara_veil"],"learns":[{"entityKey":"amara_veil","factKey":"rook_holds_the_slip"}]}}`
  (one object — the two spans are split for width only).
- **Run:** 1. Open the brief. 2. Edit → paste → Save.
- **Verify:** `briefs.hand_edited=true`,
  `briefs.knowledge_contract` stores **only** `{pov, learns}` — the service narrows it
  (`generation.service.ts:563`). `GET /briefs/:n` echoes it back. No model call.
  `body` is required and `knowledgeContract.pov` carries `minItems: 1`, so an omitted `body` or an empty
  `pov` is a 400 here, not a silent no-op (`ai/schemas/knowledge-contract.schema.ts:17`).
- **Fails when:** `DRF_001` if the upsert returns nothing. **Gap:** `PUT /briefs/:n` cannot set `writeMode` —
  the only ways to get `write_mode='external'` are the insert endpoint or a `brief.update` proposal op
  (`chapter-insert.service.ts:183`, `proposal-apply.service.ts:834`).

#### Chapter generation (happy path)

- **Entry:** **Chapters** screen → the generate button (one chapter; its menu also offers the next five) or the chat's plan card
  "Write chapter N" (Part 6); `POST /projects/:projectId/generate` → **202**.
- **Preconditions:** no draft with `review_status='contradiction'` (else `DRF_003`); briefs exist (else `BRF_001`);
  no stale brief in the batch (else `BRF_002`). Volumes are not required and have no approval step.
- **Input:** `{"limit":1,"autoFix":true}` — what the UI sends by default. For the ladder add `"maxFixes":3`.
- **Run:** 1. **Chapters** → generate chapter 1. 2. Click the progress banner. 3. When it settles open the chapter.
- **Verify:** `jobs` row `kind='generate'`, `target='1'`, payload `{chapters,autoFix,maxFixes,guidance}`.
  `workflow_runs` row `graph='chapter-generation'`; `node_trace` should read
  `assembleContext → draftChapter → persistDraft → mechanicalCheck → judge → accept → finish`.
  `accept` is reached only when the verdict is `consistent` **and** all four compliance flags hold
  (`routeAfterJudge`, `chapter-generation.graph.ts:116`); with `autoFix` off, any miss routes to `awaitReview`
  instead and leaves `review_status='contradiction'`. A judge that simply omits `briefCompliance` counts as
  non-compliant (`:409`), so a weak judge model lands here on an otherwise clean chapter.
  `drafts`: `revision=0`, `generator='standard'`, `review_status='needs_review'`, `judge='consistent'`,
  `volume_key` set. `draft_revisions` gains `source='generated'` with the `run_id`.
  **Workflow Runs** screen → the run → `generation@2.9.0`, `judge@2.4.0`, tokens in/out, tool calls, and
  "Prompt anatomy" → "View full context" for the rendered pack (`runs.tsx`). Each call's `cost_usd` carries its
  `cost_source` (`provider`, `gateway` or `estimate`). `GET /projects/:projectId/drafts/1/prompt` returns the same pack.
  **Quality:** the draft must land the brief's `endingContract.hookType` on its last beat and must not open by
  recapping — read the last 5 lines against the brief's `handoffState`.
- **Fails when:** `DRF_003` / `BRF_001` / `BRF_002`; a second call while a job is
  `pending|in_progress` silently returns the _existing_ job (`generation.service.ts:589`); job `last_error`
  `chapter N generation failed (run …)`.
- **Re-running a chapter:** `POST /projects/:projectId/chapters/:n/regenerate` (202) redrafts it from its current brief
  through the same job and gates, replacing the prose in place; the old text stays in the revision history. It is
  refused on a final chapter; a final chapter changes only through Amend.
- **Cost:** ~2–3 calls (generation, 0–2 `chapter-expand@1.1.0` passes, judge, + `title@1.1.0` only if the
  writer returned no title).

#### PROVOKING the judge / repair ladder

- **Entry:** `POST /projects/:projectId/generate` with `autoFix`. The **Chapters** generate menu's **Advanced** →
  "Judge + repair" checkbox (on by default) sends `{limit, autoFix}`; nothing in the web sends `maxFixes` or
  `guidance`, so send those over the API with `projects:write` + `generation:run`. The graph's own default is
  `autoFix: false` (`chapter-generation.graph.ts`); the fields ride the `jobs.payload` into the graph.
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
  (`routeAfterPatch`, `chapter-generation.graph.ts:264`). `model_calls` gains one `fix` row per patch attempt
  (`prompt_version` reads the live `fix.prompt.ts` version — `repairPatch` reads it off `PROMPT_REGISTRY.fix.version`
  rather than a hardcoded string) and a second `generation@2.9.0` per rewrite. `drafts.revision` increments
  once per persisted attempt; `draft_revisions.source` reads `patched` for a patch attempt and `rewritten`
  for a rewrite attempt — both nodes set `repairMode` to their own kind, so the node trace and the source
  column agree.
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
  `source='revised'` linked to that `feedback_id`. `model_calls`: `revision@1.5.0`.
  **Every descendant draft is marked stale** — `drafts.stale_reason = 'ancestor chapter N was revised'`
  for chapters > N (`markDescendantDraftsStale`). **Quality:** diff `GET /drafts/:n/revisions/:r` against the
  previous revision — the note's three asks must each be visible; a revision that only rewords is a failure.
- **Fails when:** `DRF_002` on a finalized draft, including one finalized while the model call ran; `DRF_013`
  when anything wrote to the draft during the call — an edit, regeneration, revise, judge, approval or stale
  marking (the write is bound to the revision and row version, `xmin`, it read), and then no `user_feedback`
  row is kept; `DRF_001`; revised body shorter than the floor (no expansion pass runs on this path — `reviseDraft`
  does not call `expandShortDraft`).
- **Cost:** 1 model call.

#### Draft approval (and the deterministic reveal gate)

- **Entry:** **Chapters** → "Approve draft", or **Review Queue** → `A`;
  `POST /projects/:projectId/drafts/:n/approve`.
- **Preconditions:** draft not `final` (`DRF_002`) and not stale (`DRF_007`). The UI disables the button while
  `review_status` is `contradiction` or `generating`.
- **Input:** `{"revision":2,"saveSeq":0,"draftId":"<id>","idempotencyKey":"approve-ch1-attempt-1"}` — `revision`,
  `saveSeq` and `draftId` (all required) are what the author read (`GET /drafts/:n`); `idempotencyKey`, `reviewerId`,
  the three ratings and `keepStale` + `staleReason` (approve a stale draft as written) are optional.
- **Run:** 1. Approve. 2. Re-POST with the _same_ `idempotencyKey`.
- **Verify:** `drafts.review_status='approved'`; one `user_feedback` row `disposition='approved'` — the retry
  adds none (unique `idempotency_key`, `onConflictDoNothing`). **In the same transaction** the brief's
  `knowledgeContract.learns` become `character_knowledge` rows with `learned_in_chapter = n`, `source='brief'`
  (`bible/fact/knowledge-view.ts:176`); log `brief reveals ledgered`. Unknown entity/fact keys are skipped with
  the warn `brief reveals reference unknown keys — skipped` — check the **Story Bible**'s **Secrets** tab for
  the fact's knowledge list. No model call. Then edit the draft (or revise, regenerate, judge it, or change an earlier
  chapter): the `source='brief'` rows with `learned_in_chapter = n` are gone and the draft reads `needs_review`;
  re-approving restores them. Finalizing keeps them. A pair another approved or final chapter's brief also declares is
  re-ledgered at the earliest such chapter instead of disappearing. The same transaction stages the chapter's
  finalize review (`finalize_reviews`, `status='preparing'`) and queues a `finalize_review` job — Part 6 §6.
- **Fails when:** `DRF_013` when the draft is no longer at `revision`, `saveSeq` or `draftId` (no approval, audit or ledger row is written),
  `DRF_007` (regenerate first), `DRF_002`, `DRF_001`. A chat approval card is bound to the revision current when it
  was staged, so applying it after the prose changed fails the same way.

#### Finalize + continuity write-back

- **Entry:** a chapter approved after finalize reviews landed finalizes through its review
  (`POST …/drafts/:n/finalize-review/finalize`, Part 6 §6), which runs this same graph and applies only the kept
  updates. `POST /projects/:projectId/finalize` is what the web calls for a chapter with no review at all (approved
  before reviews existed); on a chapter that has a review it refuses exactly as the review route does (`FRV_*`).
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
  (`apply-continuity.ts:14,23`). `chapters.continuity_applied=true`; `projects.story_current_chapter` = n. An **isolated** draft skips extraction entirely, so it writes no proposal and
  leaves `continuity_applied=false` — that is by design, not a half-finalize
  (`chapter-finalization.graph.ts:162`). Canon written: `entities` (+`entity_appearances`), `plot_threads`,
  `mysteries`, `character_states`, `relationships`; `timeline`, `power` and `knowledgeChanges` are deliberately
  never persisted. `model_calls` records the continuity call as `continuity@1.4.0`, matching
  `ai/prompts/continuity.prompt.ts:16` — finalize and the `propose-continuity` route below both read the
  version off `PROMPT_REGISTRY.continuity.version` (`chapter-finalization.graph.ts:241`), so the two paths
  agree.
  **Quality:** read `continuity_proposals.proposal.chapterSummary` — it must state what
  _changed_, not recap the scene, and its `threads` must reuse existing `thread_key`s, not coin duplicates.
- **Fails when:** `FIN_001`/`FIN_002`/`FIN_003`/`CHP_005`/`DRF_004`; `[guard] Chapter N is not next in sequence`;
  `[extractContinuity] … already in progress` (a 5-minute claim lease is live); a half-finalized chapter
  (draft `final`, `chapters.continuity_applied=false`) is resumable — re-POST and watch for the warn
  `finalize: resuming a partially finalized chapter`.
- **Cost:** 1 continuity call.

#### Continuity proposal review (low-confidence hold)

- **Entry:** **Review Queue**'s Proposals view (`review.tsx`) lists continuity proposals in their own "Continuity"
  section alongside refinement proposals under "Refinement", and can apply or discard one directly
  (`useApplyContinuityProposalMutation` / `useDiscardContinuityProposalMutation`). **PATCH is still API only** —
  there is no UI control to edit a held entry's `confidence` before applying.
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
- **Cost:** `propose-continuity` = 1 call (`continuity@1.4.0`); apply/discard = 0.

#### Extraction to bible

- **Entry:** **Chapters** → chapter → "Add to bible";
  `POST /projects/:projectId/chapters/:n/extract-to-bible`.
- **Preconditions:** a draft with prose. Best tested on a **hand-written or unrestricted** chapter, whose canon
  never went through the finalization extractor.
- **Input:** no body.
- **Run:** 1. Open the chapter. 2. "Add to bible". 3. Toast `Canon proposal drafted — review it on the
Proposals page` (stale copy — there is no separate Proposals page any more; it means **Review Queue**'s
  Proposals view, `chapters.tsx:1253`). 4. **Review Queue** → Proposals → open → apply.
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
- **Preconditions:** `afterChapter >= max(finalized chapter number)` (`CHP_003`);
  `afterChapter <= max(chapter, brief)` (`CHP_001`); **no draft after the insert point** (`CHP_009`); **no other job or
  action holding the novel's authoring claim** (`CHP_004`).
- **Input (planner):** `{"briefOrigin":"planner","intent":"A quiet chapter where Amara reads her mother's
own withdrawal slip and realizes the handwriting is hers."}`
  **Input (hand):** `{"briefOrigin":"hand","briefBody":"…the brief, stored verbatim…"}`
- **Run:** 1. Menu → insert after chapter 2. 2. Confirm the "What this changes" dialog.
- **Verify:** response `{brief, newChapter, shiftedChapters}`. Everything above the insert point is renumbered
  in a two-phase negate-then-land pass across **every** chapter-keyed column
  (`chapter-insert.service.ts:67-105`): `briefs.chapter`, `drafts.chapter`, `chapters.number`,
  `continuity_proposals.chapter`, `context_packs.chapter`, `entities.first_seen_chapter`,
  `canon_facts.reveal_chapter`, `character_knowledge.learned_in_chapter`, `plot_threads.*_chapter`,
  `mysteries.*_chapter`, `world_facts`, `character_states`, `entity_appearances`, `chapter_images`.
  The new brief has `write_mode='external'`, `hand_edited=true`, `inserted_at` non-null, and the `volume_key` of
  the chapter it follows (of chapter 1 when inserted before it); no volume row changes. Shifted briefs have their body/`context_refs`/`knowledge_contract` chapter
  references rewritten. Descendant drafts get `stale_reason='a chapter was inserted after this point'`.
  `chapter_publications` is deliberately **not** shifted.
- **Fails when:** `CHP_003` / `CHP_001` / `CHP_009` / `CHP_004`; `S003` (`briefBody` missing for `hand`, `intent` for
  `planner`).
- **Cost:** 0 model calls for `hand`; 1 `outline@3.2.0` call for `planner`.

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
  chapter is **finalized** (a `chapters` row), not merely drafted. It also stops at the first earlier chapter with
  neither a draft nor finalized prose, carrying `stoppedAtUnwrittenChapter: N`; with nothing reachable it is 400 `DRF_011`.
  Isolated prose is firewalled from the vector index, continuity extraction, and the adjacency rule — confirm
  `GET /projects/:projectId/search?q=<a phrase from it>&index=prose` returns no hit.
- **Fails when:** `DRF_002`; `CHP_005` at finalize because an isolated draft has no summary/state — use
  `POST /chapters/:n/summarize` (returns `{summary,state}` **unpersisted**; save via `PUT /drafts/:n`, whose
  `body` field is required, so resend the prose alongside the summary or you will blank it), the UI's
  "Finalize is blocked until this chapter is summarized" alert; `CHP_007` if the draft has no prose.
- **Cost:** 1–3 calls (generation + expansion) for unrestricted; 1 (`chapter-summarize@1.2.0`) for summarize;
  0 for import.

#### Amend a finalized chapter

- **Entry:** **Chapters** → a `final` chapter → "Amend"; `POST /projects/:projectId/chapters/:n/amend`.
- **Preconditions:** `chapters.status='done'` (else `CHP_006`).
- **Input:** `{"content":"…full replacement prose…","title":"The Withdrawal Slip",
"note":"Rewritten after the Assize timeline changed."}`
- **Run:** 1. Open a finalized chapter. 2. "Amend" → paste → confirm.
- **Verify:** response `{chapter, wordCount, indexed, republished, publicationRevision?, suggestExtractToBible:
true}`. `chapters.content` replaced, `word_count` recomputed, **`locked` stays `true`** — amend is the only
  write past the lock and it never unlocks. The replaced draft body is kept as a `draft_revisions` row at the
  draft's current revision (unless one is already there); the `final` draft then takes the same `body`, `words` and
  (when sent) `title` and rating, with `judge`/`judge_note` cleared, at `revision = max(draft.revision, latest.revision)+1`,
  and a matching row `source='amended'`; a chapter with no final draft amends the chapter alone. Re-embedding happens **after** the
  transaction; on failure the chunks are dropped and `indexed:false`, and a chunk the embedder could not reach also
  answers `indexed:false` (fix either with `POST /backfill`).
  Republish only when the reader payload hash moved. The UI then shows the "Canon was not re-derived" alert —
  **the bible, continuity and downstream chapters are untouched by design**; the follow-up is "Add to bible".
- **Fails when:** `CHP_006` (chapter not finalized), `CHP_001`, `DRF_013` (the final draft moved mid-amend; nothing is written); log
  `amend: could not drop the superseded chunks; the index still holds pre-amend prose` — retrieval will serve
  deleted prose until a backfill.
- **Cost:** 0 model calls (embeddings only).

#### Character-knowledge / canon-fact leak protection

- **Entry:** `PUT /projects/:projectId/facts/:factKey` + a brief `knowledgeContract` + generation.
  UI: **Story Bible**'s **Secrets** tab.
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
  block with the full text and returns `knowledgeCompliance`. It still filters out `source='seed'` facts, but
  nothing writes that source any more — open canon is carried by `revealChapter <= OPEN_FROM_CHAPTER`
  (`common/open-canon.ts`), which is what keeps an open world rule out of the hidden set in the first
  place. (c) _Deterministic pre-scan_:
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
  alone; terms under 3 characters are skipped. The `source='seed'` exclusion in the judge's list is vestigial —
  no code mints such a fact today.
- **Cost:** pre-scan is free; the judge call is the one already made per attempt.

#### Harness observability (use for every block above)

- **Entry:** **Workflow Runs** screen (admin-only); `GET /runs`, `GET /runs/:runId`,
  `GET /runs/:runId/context`, `GET /runs/:runId/calls/:callId`, `GET /cost`,
  `GET /context/preview?purpose=generation&chapter=3`.
- **Verify:** `GET /runs` lists only the 20 latest author-facing graphs (an allowlist —
  `generation.service.ts:125`); the detail carries `modelCalls[]` (`promptKey@promptVersion`, `role`,
  `provider`, `model`, `inputTokens`/`outputTokens`, `latencyMs`, `costUsd`, `attempt`, `status`),
  `toolCalls[]` (`tool`, `args`, `resultDigest`), `nodeTrace[]` and a `contextPack` breakdown
  (`sections[]` with `key`/`tier`/`segment`/`tokens`/`truncated`, `budgetTokens`, `usedTokens`).
  `…/context` adds the exact `rendered` text; on screen that is "Prompt anatomy" → "View full context"
  → the "Rendered prompt context" dialog (`runs.tsx:404,247,281`), not a tab.
  `GET /cost` totals spend by model group, role and model, plus the last 7 and 30 days; `estimatedCostUsd` is
  the part priced at query time from registry list prices because the row recorded no cost. See 0.5.
  A `truncated: true` section, or `usedTokens` pinned at `budgetTokens`, is the harness dropping canon the
  draft needed — the most useful single signal when output quality is poor.
- **Fails when:** `CTX_001` — no context pack linked to the run (the graph links it in `assembleContext`, so
  an unlinked run failed before drafting); 403 without the admin scope.

---

## Part 4: novel import

Scope: `POST /api/v1/import`, which lands a finished manuscript as a new novel. No model is called.
Legend: **[det]** = deterministic code (a bug there is a code bug, not a model bug). `P` = projectId. API base `http://localhost:8080`.

### 1. Sample manuscript

**S4 finished English novel** (2 chapters; passes `ImportNovelBody` and `validateNovelBundle`):

```json
{
  "format": "novel-import",
  "schemaVersion": 1,
  "mode": "final",
  "novel": {
    "title": "Final Sample",
    "synopsis": "A finished English novel, imported in one bundle.",
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

### 2. Recipe: novel import [det]

- **Entry:** UI screen **Import novel** at `/import` (`.json` file upload + "Import novel" button), reached from the Projects home header button "Import novel". API
  `POST /api/v1/import` (202 `{projectId, jobId, warnings}`, route body limit 16 MiB against the app-wide 12 MB). Creates the project; not nested under `/projects/:id`.
- **Preconditions:** none. Project cap (`PRJ_004`, 409) applies.
- **Input:** S4. `mode` accepts only `final`.
- **Run:** 1. POST S4 as `{"bundle": <s4.json>}`. 2. Poll the job (`phase` inserting). 3. `GET /api/v1/projects/:P/source/chapters`. 4. Negative bodies: two volumes with
  `ordinal 1`; ordinals `1,3`; a whitespace-only `content`; `novel.cover` naming a missing asset; `mode: "source"`.
- **Verify:** `projects`: `kind` `new_novel`, one contentless `<section>/default` `bible_documents` row per `bible_section` enum value, `name=title=novel.title`,
  `brief=synopsis`, `themes=tags`; `novel.genre` lands in `projects.imported_meta` only when it matches a platform genre (otherwise a response `warning`). One
  volume per bundle volume, carrying its title; the lowest one becomes `active`, the rest `not_started` (`autoActivateVolume`). `chapters`: rows numbered 1..N in flatten order, `status='done'`, `generator='human'`, `locked=true`,
  `word_count` set. `jobs` row `kind='import'`, `target='import-P'`, `payload` compacted to `{chapters:N,hasCover:false}` once the job completes or is cancelled — a
  **failed** import never reaches the compaction, so the full bundle prose stays on the row. Invariant: `select count(*) from model_calls where project_id=P` is 0.
  Negatives return 400 with field paths `volumes` / `novel.cover` / `volumes[0].chapters[0].content` (the whitespace-only body clears the DTO's `minLength: 1` and is
  caught by `validateNovelBundle`, not AJV); a `mode` other than `final` is an AJV enum error.
- **Fails when:** 400 `ValidationError` field errors; `PRJ_004`; job `failed` mid-batch leaves the project with partial chapters (`jobs.last_error`); a `413` past the
  route's 16 MiB (the validator's content ceiling is the same figure, so its field-`bundle` 400 cannot fire through this route); a `429 IMP_001` with
  `Retry-After` while two imports are already in flight on the replica.

---

## Part 5: chat hub, illustrations, plugins, settings, quota, admin inspection

Base: every route is under `/api/v1`. `$P` = project id, `$S` = chat session id, `$T` = bearer token. Short paths are relative to `apps/novel-forge-server/src/modules/`; anything outside that is given from the repository root.
Cost basis: per-model prices are in `ai/models.ts` and the default model per group, type and tier in `ai/defaults.ts` (Standard Balanced: planning and chat `anthropic/claude-opus-5.5`, writing and review `anthropic/claude-sonnet-5`, helper `openai/gpt-5.6-luna`). Read the price of the model your turn actually resolved to before estimating.

---

### 0. Admin inspection surface (read this first — every other recipe leans on it)

#### 0.1 Access

- **Gate.** `GET /projects/:p/runs/:runId`, `/runs/:runId/context` and `/runs/:runId/calls/:callId` carry `@RequirePermission('novel-forge:admin', { highRisk: true })` (`generation/generation.controller.ts:308,323,330`). The PDP check runs in the caller's org (`packages/auth/src/module/auth-guard.ts`). A non-admin gets 403 `IAM_002` (`apps/novel-forge-server/tests/generation/run-admin-gate.spec.ts`).
- **Ungated.** `GET /projects/:p/runs` (latest 20 author-facing runs), `GET /projects/:p/cost`, `GET /projects/:p/context/preview` and `GET /projects/:p/drafts/:n/prompt`. The preview route's `@BotPermission('novel-forge:generation:run')` binds bot tokens only; a user session needs nothing beyond the controller's `novel-forge:projects:read` floor.
- **UI.** "Workflow Runs" (`/novels/$novelId/runs`) does not read OIDC session scopes — a browser session only ever carries those, never the per-organisation RBAC permission the admin routes check, so the gate asks instead: `GET /api/v1/access` (`auth/access.controller.ts`) puts the same `novel-forge:admin` PDP question to identity that `@RequirePermission` does, and `resolveIsAdmin`/`useIsAdmin` (`apps/novel-forge-web/src/lib/session.ts`) read the answer. The nav entry hides without it (`screens.tsx`'s `adminOnly`), and the route's own `beforeLoad` gates independently (`runs.tsx`) — so the nav and the server can never disagree about who is an admin.
- **How to actually get the grant.** `novel-forge:admin` is a PDP permission (`apps/novel-forge-server/src/constants.ts:12`) that **is** grantable: `NOVEL_FORGE_ROLE_CATALOG` (`auth/role-catalog.constants.ts`) declares both the permission and the `NovelForgeAdmin` role (deliberately not default, not bot-grantable — a platform role admin assigns it to a person), and identity's own seed for this app mirrors both (`apps/identity-server/src/modules/bootstrap/ecosystem-seed.constants.ts:151,161-164`) with `grantToBootstrapAdmin: true`, so the bootstrap admin persona (`admin@shadow-apps.com`, §3) already holds it out of the box. For anyone else, a platform role admin assigns `NovelForgeAdmin` through identity's `POST /api/v1/admin/role-assignments`, in the organisation the session acts in — an operator action, not a code change.
- **Fallback with no admin grant.** Query the DB directly (0.7).

#### 0.2 What each endpoint returns

| Endpoint                                              | Gives you                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /runs`                                           | The 20 newest author-facing runs (graph allowlist `AUTHOR_FACING_GRAPHS`, `generation.service.ts:125`). Fields: `id, projectId, graph, target, status, outcome, input, error, nodeTrace, jobId, startedAt, endedAt`. `chat-title` and `chat-compact` are NOT listed (fetch them by id).                                                                                                             |
| `GET /runs/:id` (admin)                               | Adds `modelCalls[]` (`id,node,role,provider,model,promptKey,promptVersion,status,inputTokens,outputTokens,latencyMs,costUsd,reasoningEffort,attempt,createdAt`), `toolCalls[]` (`id,node,tool,args,status,resultDigest,latencyMs,createdAt`) and `contextPack{id,purpose,budgetTokens,usedTokens,sections[{key,tier,segment,tokens,truncated}]}`.                                                   |
| `GET /runs/:id/context` (admin)                       | Pack summary plus `rendered`: the exact stable-then-volatile context text. 404 `CTX_001` if no pack is linked.                                                                                                                                                                                                                                                                                      |
| `GET /runs/:id/calls/:callId` (admin)                 | Model-call row plus `rawOutput` (the raw text, stored before parsing) and `error`.                                                                                                                                                                                                                                                                                                                  |
| `GET /context/preview?purpose=chat&scopeType=project` | View of a pack: `purpose`, `budgetTokens`, `usedTokens`, `sections`, `omitted[{key,reason}]` (reason `budget` or `unresolved`), `unresolvedRefs`, `renderedStable`, `renderedVolatile`, `rendered`. Purposes: `generation, outline, chat, premise, audit`. `chat` needs `scopeType` (else 400 `CHT_003`). Only `generation` is dry — every other purpose persists a `context_packs` row (see 6.10). |
| `GET /cost`                                           | The full spend view: totals plus `byGroup`/`byRole`/`byModel`/`byCostSource`/`byTier`/`byContentMode` breakdowns, each with recorded and list-price-estimated `costUsd` — see 0.5.                                                                                                                                                                                                                  |

#### 0.3 What is NOT recorded

- **System prompt, scope playbook, history, JSON-schema suffix and plugin system messages are not stored.** `model_calls` holds no request body. `context_packs.rendered` is only the stable and volatile context.
- **Tool results are not stored.** Only `args` and a 16-hex sha256 digest.
- **Pack coverage.** One pack is linked per run (`workflow_runs.context_pack_id`). `illustration` runs link none (`illustration.service.ts` never calls `linkContextPack`), so `/context` returns 404 `CTX_001`. Find those packs in `context_packs` with `purpose='illustration'`. `chat-title` and `chat-compact` link none either.
- **DB-only columns.** `model_calls.cached_input_tokens`, `plugins`, `policy_digest` and `context_packs.omitted`, `unresolved_refs` are not in any DTO.
- **Cache hits write no row.** Roles `judge, validation, continuity, extraction, review, audit, compact` are served from `llm_cache` on an identical request (`ai/model-router.service.ts:67,368`). A repeat produces zero `model_calls` rows; the debug log says "LLM cache hit — skipping model call".

#### 0.4 Reconstruct the exact prompt of any call

1. Take `promptKey@promptVersion` from the call row and open `ai/prompts/<promptKey>.prompt.ts` (chat hub: `chat-refine.prompt.ts`, version 2.3.0). The template is there, and the version must bump on any wording change.
2. Fill the variables. For `chat-refine`:
   - `scopeInstructions` = `HUB_INSTRUCTIONS` (`ai/prompts/scope-playbooks.ts`) plus the lookup vocabulary.
   - `stableContext` = the pack's stable segment.
   - `history` = `chat_sessions.summary` (as "Conversation so far…") plus `chat_messages` with `ordinal > summary_through_ordinal`. On a lookup round it also carries the previous JSON reply and a "Lookup results:" human message.
   - `volatileContext` = the pack's volatile segment.
   - `userMessage` = the turn text.
3. Then append what the router adds (`buildMessages`, `ai/model-router.service.ts:574`):
   - a final human message: "Respond with ONLY one valid JSON object matching this JSON schema…";
   - plugin `prompt.contribute` system messages, inserted after the leading system messages;
   - `cache_control` breakpoints only when the module has a `cacheStrategy` AND the resolved provider is `openrouter` with a model id starting `anthropic/` (`supportsPromptCaching`). `chat-refine` has one, over `scopeInstructions` and `stableContext`.
4. **Shortcut, dev only.** With `LOG_LEVEL=debug` the server logs `structured: invoking model` (`ai/model-router.service.ts:355`) with `input` (all template variables, not the system prompt or schema). Query `shadow-logs-dev`: `{environment="dev",namespace="novel-forge",component="server"} |= "structured: invoking model"`, bounded by start/end. Prod does not log it.
5. `AI_LANGSMITH_API_KEY` is loaded as `ai.langsmith.api.key` (`bootstrap.ts:53`) but nothing reads it back — there is no tracing wiring in `apps/novel-forge-server/src`, so setting it changes nothing.

#### 0.5 Tokens and cost per call

- `input_tokens = max(provider-reported, tiktoken o200k_base estimate of the prompt)` (`ai/telemetry.handler.ts:84`). It is a floor and can be slightly high. `output_tokens` is provider-reported, else estimated. Reasoning tokens bill as output on the provider side but are not split out.
- A text call's `cost_usd` is the provider's `usage.cost` when reported, otherwise the list-price estimate `input_tokens/1e6 × inputPrice + output_tokens/1e6 × outputPrice` frozen at write time (`ai/quota.ts` `estimateCallCostUsd`); the row does not say which. An image call's is the provider figure or null. A transport-error row carries no tokens and no cost.
- `GET /cost` sums `cost_usd` and prices only the rows where it is null (older rows, silent image providers) at query time, reporting that part as `estimatedCostUsd`. Cached tokens are billed at full price, so estimates are an upper bound.
- `reasoning_effort` records the effort the reasoning policy sent (`ai/defaults.ts` `resolveReasoningEffort`); null when the call sent none, and on every row written before the column existed.

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

Ordinary hub turns run `chat-refine@2.13.0`, role `chat` (planning-group model), node `chat-turn`, graph `chat-turn`.

- Session routes: `/projects/:p/chat/sessions...`. Non-streaming turn: `POST /chat/sessions/:s/messages`. Streaming turn: `POST /projects/:p/chats/:s/turn/stream` (note `chats`, not `chat/sessions`).
- Sessions are always scope `project`; the request body has no scope field. A new session is `auto` unless the body says `{"mode":"manual"}` (`chat.service.ts`).
- **Fixture used by blocks 1.1-1.9.** Create it once: `POST /projects {"name":"Tidewrights QA","kind":"new_novel"}`. Block 1.1 builds its canon.

#### 1.1 Manual hub turn: materialise canon as a staged proposal

- **Entry:** the composer's mode menu (**Ask first**), or the API. `POST /chat/sessions {"mode":"manual"}` then `POST /chat/sessions/$S/messages`. In a manual session every op is a card; Part 6 §3 covers the auto-mode quote rule.
- **Preconditions:** empty new_novel project.
- **Input** (`content`):
  > Set up canon for a serialized web novel, The Tidewrights. In the port city of Saltmarrow the sea takes a district every spring tide unless the Tidewrights Guild returns one named memory to the water (the Memory Tithe). Wren Okafor, a Guild apprentice, sold her dead mother's memory of the lighthouse to the smuggler Marrow Vance to pay a 40-silver debt, and wants it back. Harbour Warden Ilse Brandt secretly plans to burn the Drowned Archive, where the Ledger of Foam records every tithed memory, so none can ever be bought back. SECRET, hidden until chapter 30: the Compact was signed not with the sea but with something under the harbour that feeds on memory. Create entity records for Wren, Marrow, Ilse, the Tidewrights Guild, the Drowned Archive and the Memory Tithe rule. Give each character a want, a wound and a speech habit. Put the secret in a canon fact only. Plan 2 volumes, each with the goal it works towards. Do not run generation.
- **Run:**
  1. Send it and wait for the reply.
  2. `GET /projects/$P/proposals?status=pending`.
  3. Do NOT apply yet (blocks 1.4-1.5 use this proposal).
- **Verify:**
  - Response 201 has `assistantMessage`, `proposal` (`kind:'hub'`, `status:'pending'`, `autoApplied:false`) and no `applied` field. Domain tables are still empty: `entities`, `canon_facts` and `volumes` have 0 rows for `$P`.
  - `proposal.changeSet` holds roughly 6 `entity.upsert`, 1 `fact.upsert` and 2 `volume.upsert`, each with `rationale`. There are no `action.*` ops despite "Do not run generation".
  - `proposal.baseline` has one entry per touched ref, each with `exists:false`.
  - `chat_messages` ordinals 1 (user) and 2 (assistant); `proposalId` is set on the assistant message; `chat_sessions.title` is auto-set within seconds. It comes from a separate `chat-title@1.0.0` run (role `title`, helper model) that appears only in `model_calls`. The first message must be at least 15 characters.
  - Run: `GET /runs/<runId>` shows one `chat-refine@2.13.0` call, `attempt 0`, on the chat group's model for the turn's type and tier. The pack has purpose `chat_hub`; its sections are the novel's durable state (`story`, `notebook`, `progress`, `inventory`, `promises`, `handoff` and others from `context-assembler.service.ts` `forNovelChat`), never chapter prose.
  - **Quality:**
    - Each character record states a want, a wound and a speech habit, and Marrow and Ilse are not generic villains.
    - The secret appears ONLY in the `fact.upsert` body, with a POV-safe `constraintNote` and tell-tale `terms`. It is absent from entity bodies and bible prose.
    - Each volume carries a title and a distinct goal (`objective`) naming one concrete end state, and no other field — `conflict`, `payoff`, `targetChapterCount` and `cast` are refused.
- **Fails when:**
  - No proposal but a reply: the model discussed instead of staging. Check the raw output in `/calls/:id`.
  - 400 `RFN_004`: the change-set failed validation (op not in the hub allowlist, or an entity-bearing bible document without matching `entity.upsert`).
  - `AI_001` on the run: a repair failure.
  - A bible document staged instead of records: the playbook forbids this (`scope-playbooks.ts`).

#### 1.2 Hub declared lookups (index-only context, fetch-before-overwrite)

- **Entry:** same session as 1.1, after applying the 1.1 proposal (see 1.4). The hub context is an index: one-line volumes, first line of each document, no briefs and no prose.
- **Preconditions:** volumes and entities exist (apply 1.1 first).
- **Input:** `Rewrite volume 1's goal so it ends with the Warden's plot to burn the Archive stopped, not Wren's debt paid. Keep everything else on the volume as is.`
- **Run:**
  1. Send it. Expect a first reply that is only a lookup request (`reply` plus `lookups`), then the real answer.
  2. Optional streaming variant: block 1.8.
- **Verify:**
  - `GET /runs/<runId>` `toolCalls`: at least one row `tool=get_volume`, `node=chat-hub`, `args.volumeKey=<v1 key>`, `status=ok`, non-empty `resultDigest`. `model_calls` has 2 or more `chat-refine` rows (one per lookup round).
  - The final `changeSet` is a `volume.upsert` carrying only `volumeKey` plus the changed field(s) (`objective`, maybe `body`). Re-emitting an unchanged `title` or `ordinal` is a violation of the prompt's partial-update rule.
  - **Invariant, checked by hand.** The whole-record-overwrite rule is prompt-only; no code enforces it (`chat.service.ts` has no check). So verify that for every `volume.upsert`, `bible_document.upsert`, `brief.update` or `draft.update` in a change-set, a matching `get_*` row exists in the same run's `tool_calls`.
  - A turn never contains both `lookups` and `changeSet` (`postValidate`, `chat-refine.prompt.ts`).
  - **Budget:** at most 3 lookup rounds (`MAX_LOOKUP_ROUNDS`). Per-tool caps: `get_draft` 2, `fetch_page` 3, `search_web` 5, `get_brief` 8, `get_volume`/`get_bible_document`/`search_lore` 10, `get_entity` 15, others 5-8. Over budget writes `tool_calls.status='budget_exceeded'`. Exhausting rounds forces a reply with no lookups. It is silent; error code `CHT_004` exists but is never thrown.
  - **Quality:** the new goal is coherent with the Ledger and Archive facts from 1.1, and the reply says WHY in web-novel terms (hook, escalation).
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

- **Entry:** UI: in the chat, the turn card "N changes" with a checkbox per op and the "Apply N selected" and "Decline all" buttons, or **Review Queue**'s Proposals view. API `POST /proposals/:id/apply {"opIndexes":[...]}`.
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
- **Fails when:** an unselected op still lands (apply guard bug). Note that the `changeSet` PATCH accepts ops outside the hub scope by design-gap: `updateChangeSet` validates with no scope allowlist (`proposal.service.ts:184`), so a hand-edit can add an op outside the hub scope to a hub proposal. Confirm it, and treat it as the defect in 6.8 rather than a test failure.

#### 1.5 Action ops and one-way doors (`never auto-applied`)

- **Entry:** proposals containing `action.*` ops (`ACTION_TYPES`: generate_chapter, audit_bible, enhance_premise, judge_draft, revise_draft, approve_draft, validate, finalize, organise_notes, plan_chapter, advance_volume). Organise, plan and write run as durable jobs (Part 6).
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
  - The same door guards `action.generate_chapter` (400 `DRF_014` on a blanket apply, declined in an auto turn); applied deliberately, it still refuses a chapter that already has a draft with `DRF_015`.
  - UI: a guarded op is unchecked by default with "Applies only when you select it deliberately." The UI always sends explicit `opIndexes`.
- **Fails when:**
  - 500 `RFN_008`: it means "no executor registered for this action" (`proposal-apply.service.ts:246`), not an action failure, despite its message. Per-action failures are in `opResults`.
  - An action runs during a blanket apply of a proposal that contains finalize (guard broken).

#### 1.6 Auto mode

- **Entry:** every new chat, or `PATCH /chat/sessions/$S {"mode":"auto"}`. Auto mode
  does not apply everything: an op applies within the turn only under the quote rule (Part 6 §3); the rest are cards.
- **Preconditions:** 1.1 canon applied.
- **Input:** `Change Wren's speech habit: she hums the tide table instead of counting things. Update her record.`
- **Run:** send it in an auto session; read the 201 body, `GET /changes`, and `GET /entities/<wren-key>`.
- **Verify:**
  - An `entity.upsert` whose `quote` is found in the message lands in `appliedProposal` (`autoApplied:true`,
    `status:'applied'`) with `applied.applied[]` naming `entity:<key>`; the assistant message carries
    `appliedProposalId`. `GET /changes` lists it with `autoApplied:true`.
  - Only the changed fields are in the op (`notes` or `body`). Untouched fields are unchanged in DB.
  - Anything the quote does not cover (an invented detail, a question, a removal) is in `proposal` as a pending card.
  - **Failure downgrade.** If applying fails (a baseline conflict, a refused write) `applyNote` says why and every op
    comes back as a card.
  - One-way doors: `action.*` ops are always cards, never applied within a turn. Model-dependent; the deterministic
    path is 1.5.
- **Fails when:** an op without a found quote is applied, or the turn returns 500 (applying must never fail the turn).

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
  - SSE order: `ready`; `reset` (replay opener); `user` (user message); optional `lookup` `{round,tool,args,status:'running'→'ok'|'error'}`; many `delta` `{text}`; a `change` `{index,op,label,group}` per changeSet element as it completes (group: premise|pages|people|places|power|threads|other; index restarts after each `reset`); optional `reset`; final `done` (`{userMessage,assistantMessage,proposal?,applied?,applyNote?,runId}`) or `error` `{code,message}`. The stream closes after the terminal frame.
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
  - A plugin cannot issue `action.*` or any op outside the plugin allowlist (entity/fact/bible_document/brief.update); such output gives 400 `PLG_005` and stages nothing. A `brief.update` that sets `volumeKey` is also `PLG_005`.
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
- **Run (brief.policy):** no route triggers this decision point today; `PluginProposalService.stageBriefPolicy` waits for a planning pass to call it.
- **Verify (brief.policy):**
  - A pending proposal summary "Brief policy from harbor-lens", `changeSet:[{op:'brief.update',chapter:1,writeMode:'external'}]`; the briefs are already written (the planner is nudged, not compelled). Applying it sets `briefs.write_mode='external'`, which halts a batch generate at that chapter until finalized.
  - Only the first plugin (ordinal order) answers; a second answering plugin is ignored with a warning.
- **Fails when:** the model does not change on the raised role, or `write_mode` is set without a proposal.

#### 3.5 Failure isolation

- **Run:** edit `index.js` so `contributeSystemMessages` and `contributeContextSections` do `throw new Error('boom')` (or `augmentCanon`), restart, repeat 3.3 and 3.2.
- **Verify:** the hub turn still succeeds with a normal reply and no plugin section; the server logs warn "plugin decision point threw — contribution dropped" `{pluginId,point,reason}` for the policy hooks, and "plugin decision point failed — contribution dropped" for `augmentCanon`/`decideBriefPolicy`; augment returns 204 (`collect` swallows the error). A generation run is never failed by a plugin.
- **Fails when:** any 5xx or a failed run caused by a plugin hook.

---

### 4. Account settings and model routing

#### 4.1 Default cost tier, precedence and routing

- **Entry:** UI Settings (`/settings`: one "Default cost tier for new projects" control, Economy / Balanced / Performant; "Save changes"; info alert "How models are picked"). API `GET /ai/models`, `GET|PUT /ai/settings`, `POST /projects`, `POST /projects/new-novel`, `POST /import`, `POST /projects/:p/clone`, `PATCH /chat/sessions/:s/model`, `PATCH /projects/:p {"config":{"models":{…}}}`.
- **Input:** `PUT /ai/settings {"defaultCostTier":"economy"}`.
- **Run:**
  1. `GET /ai/settings` on a fresh account → `{"defaultCostTier":"balanced"}`.
  2. PUT as above, then create a project through each creation path without a `costTier`, and once with `"costTier":"performant"`.
  3. Clone a Performant project.
  4. Hub turn on an Economy project (new chat), then check its `model_calls`.
  5. Project override: `PATCH /projects/$P {"config":{"models":{"chat":{"provider":"openrouter","model":"openai/gpt-5.6-luna"}}}}`, turn.
  6. Pick Performant for one turn in the composer, then send another turn without it.
  7. Set project `contentMode:'unrestricted'` with a standard-only chat pin (e.g. `anthropic/claude-opus-5.5`), turn.
- **Verify:**
  - Step 2: every project created without a tier is Economy; the one that named Performant is Performant. A bot-owned project starts on Balanced, and `PUT /ai/settings` as a bot is 403 `AI_016`.
  - Step 3: the clone is Performant whatever the account default.
  - Step 4: the chat call's `model` is the Economy chat model from `GET /ai/models` `tiers`, and `chat_messages.model_id` (assistant) matches.
  - Precedence exactly: the turn's tier > project pin for the role > the tier map. Step 5 uses the pin; step 6 uses the Performant chat model for that turn only, and the next turn is back on Economy.
  - Step 7: a pin not on the unrestricted allowlist (`x-ai/grok-4.6, deepseek/deepseek-v4-pro, z-ai/glm-5.2, moonshotai/kimi-k3`, image `x-ai/grok-imagine-image-2.0`) is ignored; the project uses the unrestricted model for its tier. `GET /ai/models` `unrestrictedAllowlist` shows the list.
  - `GET /projects/:p/models` reports each group's `source` as `project` or `tier`, never anything else.
  - Group→role mapping: Illustrations compose runs on the helper group (not Planning); embedding and vision are not configurable.
- **Fails when:** a project created without a tier ignores the account default, a PUT with a value outside economy/balanced/performant is accepted, or a project override with an unregistered id does not give 400 `AI_002` at call time.

---

### 5. AI quota and spend limits

#### 5.1 Rate and spend ceilings (per owner, rolling window)

- **Entry:** operator env `AI_QUOTA_MAX_CALLS` (default 1000), `AI_QUOTA_MAX_COST_USD` (default 50), `AI_QUOTA_WINDOW_MS` (default 3600000) — `bootstrap.ts:50-52`, documented in `.env.example:32-34`. `<=0` disables a limit dimension; a `<=0` window does not disable anything, it just makes the window empty. Restart to apply. The chat failure copy reads "Too many model calls right now" (`AI_008`) and "AI spending limit reached" (`AI_009`) (`novel-forge-web/src/components/nf/TurnStatus.tsx:39-40`).
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
  - Step 4: the second project is blocked too (per owner). Projects with no owner id share one window. After the window elapses (or with a smaller window) calls resume.
  - `chat-title` and helper calls are gated the same way; the refused title call is silent.
  - Read failure fails CLOSED: 503 `AI_018` with `retryable: true` (an `organise` or `plan` job is retried once; every other job fails with it), logged at error "AI quota check failed — usage read failed, refusing the model call".
- **Fails when:**
  - Refused at count N-1 (off by one), or the second project not blocked.
  - Spend never trips for an unpriced model: unknown or unpriced models contribute 0.
  - Image spend is counted only when the provider returns `usage.cost`; otherwise it is 0 because image models have no registry price.

---

### 6. Code/doc mismatches and broken or unreachable behaviour

1. **Tool-loop calls are recorded only with a telemetry context.** `ModelRouterService.chatFor` binds the telemetry callback only when its caller passes a `TelemetryContext`; a `runToolLoop` over a client built without one writes no `model_calls` row, and `GET /cost`, the quota's spend window and the Runs view leave that spend out. Check the judge's calls appear in `model_calls` before trusting a cost figure.
2. **`model_calls.status` enum is mostly dead.** `parse_error`, `repaired`, `refused` and `timeout` are never written (enum at `src/database/schemas/ai.ts:42`). The Runs UI "repaired" chip can never show; a repaired call is an `attempt=1` row with `ok`.
3. **Every recorded cost counts as the real charge.** `model_calls.cost_source` says where a figure came from (`provider`, `gateway`, or `estimate` from list prices at write time; null on older rows), and `GET /cost` breaks spend down by it, but the totals add every source alike (`ai/quota.ts` `classifyCostSource`).
4. **Illustration runs have no linked context pack.** `/runs/:id/context` returns 404 `CTX_001`; the pack is only in `context_packs`. `chat-title`/`chat-compact` are also not listed in `GET /runs`.
5. **Dead plugin API surface.** Manifest `actions` and the hooks `invoke`, `onEvent`, `registerPrompts` and `contributeWritingKnobs` are declared but never called (`plugin-policy.service.ts` hard-codes `knobs: {}`).
6. **Unused error codes.** `CHT_004` and `CHT_005` are never thrown anywhere in the server (`AI_003` is: an unrestricted call that resolves off the allowlist refuses with it, `ai/unrestricted-route.ts`). Lookup-budget exhaustion is silent. `RFN_008`'s message ("Action execution failed — see the per-op results on the proposal") does not match its use (`proposal-apply.service.ts:246`: no executor registered).
7. **Proposal hand-edit skips the scope allowlist.** `proposal.service.ts:184` `updateChangeSet` calls `validateOps(kind, changeSet)` with no `allowedOps`, so a hub proposal can be hand-edited to carry any op in the global list. (Plugin proposals keep their own allowlist.)
8. **`GET /context/preview` persists a pack for every purpose except `generation`.** Only the `generation` branch passes `dryRun` (`refine.service.ts`); `outline`, `chat`, `premise` and `audit` all insert a `context_packs` row (deduplicated by hash).
9. **Product doc.** `novel-forge.md` matches the code on hub, proposals, plugins and quota. One gap: the doc says every call logs `promptKey@promptVersion`, true for `model_calls`, but no API returns the full prompt (0.3).

---

## Part 6: the chat-first flow

The path an author takes today: a title and notes, a chat that organises them into the Story Bible, one chapter planned
and written at a time, reviewed before it is finalized. Every route is under `/api/v1/projects/$P` unless it says
otherwise; `$S` is the chat session. Prompt versions are whatever `PROMPT_REGISTRY` (`ai/prompts/index.ts`) lists: read
them off `model_calls` rather than trusting a number here. Cost and admin inspection work as in Part 5 §0.

### 1. New novel and the progress map

- **Entry:** Projects → "Start a new novel"; `POST /api/v1/projects/new-novel {"title","notes"?,"contentMode"?}`.
- **Input:** a title and 800–1,500 words of your own notes about the book (the Part 3 sample idea, expanded).
- **Verify:** 201 `{projectId, sessionId}`; the session is `mode='auto'`. `GET /notes` returns the notes verbatim.
  `GET /progress` lists the checklist items (`premise`, `protagonist`, `opposition`, `theme`, `reader_promise`,
  `ending`, `first_volume_goal`, `next_chapter_planned`, …) as `open` or `answered`. `PUT /progress/theme
{"status":"undecided"}` answers an item as settled with no value, `{"status":"dismissed"}` hides it, and
  `DELETE /progress/theme` clears the override. The checklist is advice: nothing refuses planning or writing
  because an item is open. An override is a ledger entry on topic `progress.<key>` and never shows among the
  Notebook's decisions or its do-not-propose list.
- **Fails when:** `PRJ_014` blank title; `PRJ_012` notes over 10,000 words (also on `PUT /notes`); `PRJ_013` unknown
  checklist key.

### 2. Organise notes (a chat action)

- **Entry:** ask the chat to organise your notes; it offers an `action.organise_notes` card. Accepting it queues a job
  (`jobs.kind='organise'`, graph `notes-organise`); follow it with `GET /chat/sessions/$S/jobs` or the SSE
  `…/jobs/stream`.
- **Preconditions:** at least 600 words of notes (`NTS_003`); no organise card still pending (`NTS_004`).
- **Verify:**
  - Entries whose quote is found in the notes, stated rather than hedged, apply at once as one revertible proposal:
    the transcript's "Added to your Story Bible — from your notes · Undo" block shows each written value beside
    its quote. Everything else (no quote, inferred sections, the model's own suggestions, the planner-only
    timeline `project/timeline` and open questions `project/open-questions`, removals, rules) waits on one card.
  - Each entry cites notes paragraphs; the receipt lists "not used yet: N paragraphs (…)", the paragraphs nothing
    drew on. Check that list against your notes by hand: a fact in neither the Story Bible nor that list was lost.
  - `refinement_proposals.organise_record` is set on each organise proposal; a second run rewrites what organising
    owns in place rather than beside it.
  - Undo all on the turn's receipt, or reverting the applied proposal (`POST /proposals/:id/revert`) puts the Notebook back as it was; it is refused with
    `NTS_010` while a later organise change builds on it.
  - **Quality:** nothing the notes place late in the book appears as current; the ending lands only in planner-only
    pages; a suggestion is labelled as one.
- **Save as notes:** send one chat message of 600+ words that the notes do not hold. Your message then carries
  `offersNotes`; `POST /notes/from-message {"sessionId","messageId"}` appends it as paragraphs of its own
  (`NTS_006` under 600 words, `NTS_005` not your message).

### 3. A chat turn under the quote rule

- **Entry:** any auto session. `POST /chat/sessions/$S/messages {"content","justDiscussing"?,"proseEdits"?}`.
- **Input A (stated):** `Marrow Vance runs the ferry at night and owes the Guild forty silver.`
- **Input B (hedged):** `Maybe Marrow runs the ferry at night? Not sure yet.`
- **Input C:** Input A again with `"justDiscussing": true` (the composer's **Just discuss** mode).
- **Verify:**
  - A: the entity op lands in `appliedProposal` with its `quote`; the assistant message carries `appliedProposalId`.
    Anything the model added beyond your words (a new trait, a rank) is in `proposal` as a card. The changes panel's
    change list shows each written value beside its quote, with a per-change undo.
  - B and C: nothing applies; every op is a card.
  - Removals, plans, prose, actions, planner-only pages, replacing a filled story field, a secret's truth or its
    gating, a volume's order or notes, and a promise's status or progress are always cards whatever the quote
    (`refinement/write-policy.ts`, `ALWAYS_CARD` and `alwaysCardRule`).
  - Undo impact: `GET /proposals/:id/undo-impact` lists `dependents` (plans, drafts, knowledge and pending
    suggestions that rely on the change) and `finalUnaffected` before you revert.
- **Fails when:** an op applies on a quote from a question or a hedged sentence, or with no found quote.

### 4. Turning down a suggestion

- **Entry:** the chat's decline on a suggestion card (Never, Not now, Not this version; an action card's "Don't run it"
  records nothing), or `POST /proposals/:id/ops/:opIndex/reject {"scope","why"?}` with scope
  `never`, `not_now` or `not_this_version`.
- **Run:** reject one suggested entity with `never`; then ask the chat for the same idea again.
- **Verify:** a Notebook entry `kind='rejected'` on topic `idea.<ideaId>` with its `rejection_scope`. The same op (same
  kind and fields, text normalised) is dropped from later turns' cards, together with anything that leaned on it; an
  op your own words back is never dropped. `not_now` lapses when the active volume changes; `not_this_version` lapses
  when a record the idea would change is edited. Rejecting the same idea again replaces the scope rather than adding
  an entry.
- **Fails when:** `LDG_006` no such op; `LDG_007` an action op; `LDG_008` `not_this_version` on an op that names no
  record.

### 5. Plan the next chapter, then write it

- **Entry:** the chat's plan start (pick a suggested direction, "I know what happens", "Write the plan myself"
  for an empty plan, or "Write it myself"); the card op `action.plan_chapter {chapter?, direction?, intent?, empty?}` queues a `plan` job (graph
  `chapter-plan`, prompt `chapter-plan`) that stages a `chapter_plan` card holding one `brief.update`.
- **Verify:**
  - The card is for the next writable chapter only (`PLN_006` otherwise; `PLN_007` for an empty plan over an existing
    one).
  - Obligations recap: the previous chapter's hook, the most pressing promise (overdue before due before the one
    quiet longest; one dormant on purpose never), the active volume's goal.
  - Every scene names a point of view that is a character (a `pov` diagnostic otherwise); scene POVs that know
    different secrets raise a `pooling` diagnostic, since the writer gets their knowledge for the whole chapter.
  - Milestone claims and reveals obey the reveal rule: a reveal whose unlock does not hold is cut from the contract
    and every text field before the card is shown; a hand edit that adds one is refused (`PLN_001`, `PLN_003`).
  - `GET /proposals/:id/writer-preview` shows what the writer would read: `included`, `unresolved`, `kept` (held back
    and why), and the secrets the card `unlocks` or `relocks` against the stored plan.
  - "Write chapter N" saves your card edits (`PATCH /proposals/:id`), applies the card, then calls `POST /generate`;
    if writing fails to start, the card says the plan was saved.
- **Fails when:** `PLN_008` the story moved on while the card waited; `PLN_009` a plan job already running.

### 6. Review before finalize

- **Entry:** Chapter workspace → Approve → Finalize. Routes: `GET /drafts/:n/finalize-review`,
  `POST …/finalize-review/prepare`, `POST …/finalize-review/items/:itemId/decision {"decision","reason"?}` (`kept`,
  `edited` with the inline edit, or `skipped`), `POST …/finalize-review/keep-routine`, `POST …/finalize-review/finalize`,
  `POST …/finalize-review/revert`, and `PUT /finalize-review/settings {"autoKeep":[…]}`.
- **Run:** approve chapter 1 (Part 3), wait for the `finalize_review` job, answer every item, finalize.
- **Verify:**
  - The items are read from the approved revision by a `continuity` call. Consequential ones (rules, payoffs,
    knowledge, milestones in doubt, anything inferred, low-confidence changes) are asked one by one; routine ones
    (appearances, positions) as a batch; categories in `autoKeep` (`entity`, `appearance`, `character_state`,
    `relationship`, `promise`, `knowledge`, `milestone`, `summary`) are kept at once.
  - Finalize applies only the kept and edited items, logging each row before and after, and reaches only the claimed
    milestones you kept; a claimed milestone you skip is dropped from the plan.
  - Editing the prose after approval makes the review stale (`FRV_004`) until you approve again.
  - Revert puts every row the kept set changed back and marks later drafts stale; it works only on the latest final
    chapter (`FRV_012`) and is refused if one of those rows changed since (`FRV_007`).
- **Fails when:** `FRV_002` still preparing; `FRV_003` reading failed (prepare again); `FRV_005` items unanswered;
  `FRV_006` a skipped milestone that a reveal in this plan needs; `FRV_010` a skip with no reason.

### 7. Passage rewrite and versions

- **Entry:** Chapter workspace → select a passage → "Ask for changes"; `POST /drafts/:n/passage-suggestions
{"baseDraftId","baseRevision","baseSaveSeq","start","end","passageHash","request"}` (UTF-16 offsets, SHA-256 hex of the
  selected text), then `…/:suggestionId/apply` (the same three base fields) or `…/dismiss`.
- **Verify:**
  - A `passage-rewrite` call on the chapter's writer route, captured as a `writer_snapshots` row with role `passage`.
    The draft does not change until you apply.
  - The suggestion's `location.freshness` is `fresh` as made; `relocated` after you move the passage cleanly (its
    text and the 32 characters either side occur exactly once); `stale` after an edit in or around it, and applying
    is then `PSG_004`.
  - Applying writes a new revision (`passage_rewritten`), resets approval and marks later drafts stale. A rewrite that
    brings a locked secret's give-away terms into the passage is held as a contradiction (`leakLines` lists them).
  - Versions: `GET /drafts/:n/versions`, `…/versions/compare?from=&to=`; `POST …/versions/:r/restore` (base fields)
    writes a new `restored` revision, and history is never rewritten.
- **Fails when:** `PSG_003` the selection no longer matches; `PSG_006` / `VER_002` on a final chapter (use Amend).

### 8. Writer's view

- **Entry:** Chapter workspace → Writer's view; `GET /chapters/:n/writer-snapshots`, `…/:snapshotId`.
- **Verify:** one row per writer attempt (`draft`, `repair`, `rewrite`, `revise`, `passage`) holding the exact messages,
  `keptBack`, plan revision, prompt key and version and the model route as they were at the time, never rebuilt from
  today's state. Attempts of the current revision and the two before it are kept. On an isolated chapter the
  messages read "Prose: walled off" and `bibleHash` is null.

### 9. An unrestricted chapter and its bridge

- **Entry:** set the plan card's content to Unrestricted, write the chapter, approve it.
- **Verify:**
  - Every call on that chapter's prose runs on the unrestricted route (`model_calls.content_mode`); the draft is
    `isolated=true` and excluded from `GET /search` and `GET /source/chapters/search`.
  - The finalize review asks the bridge summary and each position one by one. Until you answer them the chat's
    `get_draft` returns only the chapter's header and a later standard chapter reads no summary of it; afterwards
    both read the approved summary and positions only (`GET /drafts/:n/bridge` shows exactly that).
  - Editing the chapter's text drops the bridge until one is approved against the new revision. After an amend of a
    final isolated chapter, `POST /drafts/:n/bridge/prepare` reads it again (`BRG_002` if not final, `BRG_001` if not
    isolated). Reverting the chapter's Story Bible updates keeps the bridge.
  - Input that crosses the hard line is refused before any call with `AI_015`, naming the record.

### 10. Portraits as of a chapter and the wiki gate

- **Entry:** Illustrations, or a character's portrait → "as of chapter N"; `POST /illustrations {…,"depictsChapter":N}`;
  uploads through `POST /entities/:key/image` or `…/images` with `depictsChapter`; re-date with `PATCH …/image` or
  `…/images/:imageId`.
- **Verify:** a generated portrait is drawn from canon as of N and refused past the latest final chapter (`ILL_016`);
  `ILL_017` for a subject that is not an entity; `ILL_018` for a reference image dated later than N. An upload may name
  a later chapter and is withheld until it. With no chapter given, an image is dated at the latest final chapter.
- **Publish:** a portrait dated later than its entry's first sighting reaches Web Novel under its own
  `imageVisibleFromOrdinal` when the reader advertises the headline-gate capability, and otherwise joins the gated
  gallery; a reader short of that chapter sees no portrait on the entry page.

### 11. Promises, volumes and usage

- **Promises:** `GET /promises?kind=&status=` lists threads and mysteries with `due`: `overdue` (a chapter window
  passed, or the payoff volume's goal is met), `due` (the payoff milestone reached, or the payoff volume active),
  otherwise `not_due`. Set a payoff with a `promise.set_payoff` card; `dormant: true` takes it out of the obligations
  recap.
- **Volume goal met:** `POST /volumes/:volumeKey/goal-met` on the active volume marks it `goal_met` and activates the
  next `not_started` one (`VOL_003` if it is not active). The chat's `action.advance_volume` card does the same and is
  never applied within a turn (`VOL_004` on a blanket apply).
- **Usage and cost:** `GET /cost` (the project, with `byCostSource`, `byTier`, `byContentMode`), `GET /chapters/:n/cost`,
  `GET /runs/:runId/usage`, `GET /api/v1/ai/usage` (every novel you own) and each assistant message's `costUsd`. Every
  figure adds recorded costs of every source (`provider`, `gateway`, `estimate`) as the charge.
- **Chat lookups:** ask "what did chapter 3 cost?" and "what did the checks find in chapter 3?". The run's
  `tool_calls` show `get_usage` (no prompt or answer content) and `get_review`; on an isolated chapter `get_review`
  returns findings without their evidence.
