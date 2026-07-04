# State

> Caveman-style fact sheet. Bullets, not prose.

## Stack

- Bun runtime, TypeScript strict, ESM modules
- `@shadow-library/app` DI, `@shadow-library/fastify` HTTP, `@shadow-library/modules` DatabaseModule
- Drizzle ORM + bun-sql driver, PostgreSQL, pgvector (1024 dims)
- LangChain + LangGraph + LlamaIndex.TS for AI layer
- `bun:test` + template-DB clone per spec; 90% coverage enforced

## Conventions

- Section banners in every file (side-effects / npm / user / types / constants)
- 180-char print width, single quotes (prettier)
- `@server/*`=src/*, `@modules/*`=src/modules/*, `@scripts/*`=scripts/*, `@tests/*`=tests/*
- Source files: relative imports. Tests: alias imports.
- Errors: AppErrorCode extends ServerErrorCode; `throw new ServerError(AppErrorCode.XXX)`
- Logging: `Logger.getLogger(APP_NAME, ClassName)` — no console
- Drizzle: `bigserial({mode:'bigint'})` PKs, namespaced type exports, `relations(...)`

## Capabilities

### M1 — Project structure & dependencies
- `@shadow-library/*` bumped to pulse versions; drizzle-orm, langchain stack, llamaindex in package.json
- `moduleResolution: bundler`; aliases `@modules/*`, `@scripts/*`, `@tests/*` added to tsconfig
- bootstrap.ts owns all config keys: `app.stage`, `server.*`, `ai.*` (anthropic/openai/xai/ollama/subprocess), `storage.*`
- `src/constants.ts` exports `APP_NAME = 'novel-forge'`
- `src/modules/dynamic.modules.ts`: `HttpRouteModule` with `/api` prefix + versioning; no feature modules yet
- `src/app.module.ts` imports `[DatabaseModule, HttpRouteModule]`
- `AppErrorCode` groups: PRJ/SRC/CHP/PLN/DRF/FIN/AI/CNT/ENT all defined
- `AuthGuard` permissive seam in `src/common/auth.guard.ts`
- `DatabaseModule` wired (empty schema); `constraintErrorMap` empty (M2 fills it)
- db scripts: `db:migrate`, `db:create-template`, `db:seed`
- `TestEnvironment` in `tests/test-environment.ts` (requires PostgreSQL + template DB)
- Tests require PostgreSQL; legacy scaffold test removed; `bun test` passes on unit-only specs

### M2 — PostgreSQL schema & Drizzle migrations
- 9 schema files: projects, chapters, knowledge, plan, story, bible, generation, jobs, vectors
- 22 tables, 17 pgEnums; namespace type exports per file
- `vector(1024)` via customType; `CREATE EXTENSION vector` + HNSW index in migration
- `contentGenerator` enum defined in projects.ts; imported by chapters.ts + generation.ts
- projects.ts self-ref FK uses `AnyPgColumn` annotation; `projectRelations` uses `one()`
- All 18 EnumType exports in `enum.dto.ts`; eslint `no-namespace: off` added to match pulse

## Considered but deferred

- External durable queue (in-process JobService sufficient per §1.1.9)
- S3 image storage (interface only; local ships first)
- Flask browse UI (out of scope; future frontend)

### M3 — Core domain modules

- ProjectModule: create/list/get/update/clone/delete/reset/status/cost — 9 routes under `/api/v1/projects`
- SourceModule: ChapterService list/get/update/delete — 4 routes under `/api/v1/projects/:projectId/source/chapters`
- BibleModule: EntityService (upsert-on-conflict), VolumeService (upsert + approve), BibleDocumentService — 15 routes total
- new_novel project creation seeds 7 bibleDocument rows (one per section, slug='default')
- clone uses `db.transaction` — copies child tables; `resetDerived=false` path is a TODO stub
- VOL_001 (volume not found) + DOC_001 (bible doc not found) added to AppErrorCode
- Integration tests PG-gated with top-level `await` SQL probe; 6 tests skipped cleanly without PG

### M4 — Repository/persistence semantics

- `KnowledgeRepository` in `src/modules/extraction/knowledge.repository.ts`; 12 methods
- upsertEntity: attributes merged via `COALESCE(existing,'{}') || EXCLUDED`; firstSeenChapter via LEAST
- insert-or-ignore: addAppearance, addRelationshipObservation, upsertEntityAlias (onConflictDoNothing)
- COALESCE upserts: plotThread (openedChapter keeps first, closedChapter takes latest), mystery, worldFact, beat
- workSummary/rearmJobs/pendingJobs/corpusStats on jobs + related tables
- ExtractionModule wired to HttpRouteModule; TestEnvironment.getService<T> added for DI access in tests

### A1 — AI data model & migrations

- `src/database/schemas/ai.ts` — 7 tables: workflowRuns, modelCalls, toolCalls, contextPacks, draftRevisions, userFeedback, loreChunks; 6 pgEnums; Ai namespace
- draftReviewStatus enum + reviewStatus column on drafts; contextRefs on briefs; epitome on volumes
- `generated/drizzle/0001_sticky_freak.sql` — all new tables/columns + HNSW index on lore_chunks.embedding
- `@langchain/langgraph-checkpoint-postgres@1.0.4` added; PostgresSaver.setup() wired into migrate script
- AiModule scaffolded (empty, no providers yet)
- 7 new EnumType exports in enum.dto.ts: DraftReviewStatus, WorkflowRunStatus, ModelCallStatus, ToolCallStatus, DraftRevisionSource, UserFeedbackArtifactType, UserFeedbackDisposition

## Open issues

<!-- none yet -->
