# Architecture

## Product

AI-powered novel generation API: ingests source web novels, builds structured knowledge graphs, and authors original novels via draft/judge/repair loops — targeting multi-tenant HTTP API clients.

## Stack

- Runtime: Bun (`"type": "module"`)
- DI: `@shadow-library/app` (`ShadowFactory.create`, `@Module`, `@Injectable`)
- HTTP: `@shadow-library/fastify` (`@HttpController`, `@Get/@Post/@Patch/@Delete`, `@RespondFor`)
- DB: PostgreSQL + `drizzle-orm` (Bun SQL driver) + pgvector (1024 dims)
- AI: LangChain (single calls) + LangGraph (stateful graphs) + LlamaIndex.TS (retrieval)
- Testing: `bun:test` + template-DB clone per spec
- Out of scope v1: auth (seam in place), Flask browse UI, data migration from Python CLI

## Structure

```
src/
  main.ts               ShadowFactory.create(AppModule)
  bootstrap.ts          Config.load for all env keys + ConfigRecords augmentation
  app.module.ts         @Module({ imports: [DatabaseModule, HttpRouteModule] })
  constants.ts          APP_NAME = 'novel-forge'
  classes/              AppErrorCode (extends ServerErrorCode) + index barrel
  common/               enum.dto.ts, data-transformers.ts, auth.guard.ts, index.ts
  database/
    database.module.ts  CoreDatabaseModule.forRoot with constraintErrorMap
    database.constants.ts  constraintErrorMap
    schemas/            one file per domain; index.ts barrels
    index.ts            re-exports schema + module
  modules/
    dynamic.modules.ts  HttpCoreModule.forRoot + FastifyModule.forRoot (routePrefix /api, versioning)
    ai/                 model-router, telemetry, context, retrieval, tools, prompts, schemas, graphs
    project/            ProjectService + controller + DTOs
    source/             chapter, acquire, adapters, text-cleaner, asset services
    extraction/         ExtractionService, ConsolidateService
    planning/           skeleton, newnovel, planning, scaffold, bible-builder services
    generation/         brief, graph, draft/finalize/manuscript, grok-chapter, continuity-proposal
    validation/         ValidationService, ReviewService
    illustration/       IllustrationService + session management
    jobs/               JobService (in-process queue), ConcurrencyController
    storage/            IMAGE_STORAGE token + LocalImageStorageProvider + StorageModule
scripts/
  create-template-db.ts
  migrate-db.ts
  seed.ts
tests/
  test-environment.ts   template-DB clone per spec + ShadowApplication boot
```

## Conventions

- **DI:** NestJS-style `@Module`/`@Injectable`; services inject `databaseService.getPostgresClient()`.
- **HTTP controllers:** thin — delegate to service, throw `ServerError(AppErrorCode.XXX)` on not-found.
- **Errors:** `AppErrorCode extends ServerErrorCode`; groups in `classes/app-error-code.ts` with `/*!...*/` banners; DB constraints → codes in `database.constants.ts`.
- **Config:** all keys in `bootstrap.ts` via `Config.load(...)` with `declare module '@shadow-library/common' { ConfigRecords }`.
- **Imports:** `@server/*` = `src/*`; `@modules/*` = `src/modules/*`; `@scripts/*` = `scripts/*`; `@tests/*` = `tests/*`. Source files use relative imports; tests use `@server/@modules/@tests`.
- **File layout:** section banner comments in every file (`Importing packages with side effects` / `Importing npm packages` / `Importing user defined packages` / `Defining types` / `Declaring the constants`). Prettier: 180 print width, single quotes.
- **Logging:** `Logger.getLogger(APP_NAME, ClassName)` — no `console`.
- **Tests:** `bun:test`; `TestEnvironment` clones template DB per spec; specs mirror module structure; 90% coverage enforced.
- **Drizzle:** `pgTable`, `bigserial({mode:'bigint'})`, `relations(...)`, namespaced type exports (`export namespace Foo { export type Bar = InferSelectModel<...> }`).
- **Commits:** Conventional Commits via commitlint.

## Key domain rules

- Every table carries `projectId bigint` FK (cascade delete) — row-level multi-tenancy.
- `projects.ownerId bigint` nullable — auth-ready seam (unused now; future `WHERE ownerId=caller`).
- Every controller decorated with `@UseGuards(AuthGuard)` (permissive now; guard returns true).
- Long ops (`ingest/extract/generate/backfill`) → async `jobs` table + `ConcurrencyController`; quick ops stay sync but still acquire concurrency lock.
- Concurrency: local-LLM work ⇒ global serial `"local:global"`; remote API ⇒ per-project serial `"project:<id>"`.
- Embeddings = `ollama/qwen3-embedding:8b` at 1024 dims; illustration = `openai/gpt-image-1`.
- `grok_only` projects route every LLM/image role to xAI and disable embeddings (fail-closed).
- Single Volume planning unit (no arc tier); `volumeKey`, `/volumes` routes, `chapters_per_volume`.
- `AUTHORING_STYLE` preamble prepended to prose-authoring prompts only (not analytical).

## Subsystems

### AI Module (`src/modules/ai/`)

- `model-router.service.ts` — resolves role → LangChain ChatModel/Embeddings/ImageModel; enforces grok_only routing; transient retry via `withRetry`.
- `context/` — ContextAssembler, catalog, ref resolution, token budgets, packs.
- `retrieval/` — LlamaIndex.TS over two pgvector indexes (prose + lore), `chapterChunks` table.
- `tools/` — 6 read-only tools, tool loop, ToolContext.
- `graphs/` — `chapter-generation`, `chapter-finalization`, `bible-builder`, `source-extraction`, `novel-validation` StateGraphs + `WorkflowRunService`.
- `prompts/` + `schemas/` — versioned prompt builders + Zod schemas (port verbatim from Python `prompts.py`).

### Jobs (`src/modules/jobs/`)

- `JobService` — enqueue, recover crashed `in_progress` on boot, poll progress.
- `ConcurrencyController` — keyed async mutex; lock keys `local:global` / `project:<id>`.

### Storage (`src/modules/storage/`)

- `IMAGE_STORAGE` DI token + `ImageStorageProvider` interface.
- `LocalImageStorageProvider` — writes to `storage.imageDir`; `StorageModule.forRoot`.

## Out of scope for v1

- Flask browse UI (replaced by this API + future frontend)
- External durable queue (in-process runner sufficient)
- Data migration from Python CLI
- Auth implementation (seam in place only)
- S3 image storage (interface only; local impl ships)
