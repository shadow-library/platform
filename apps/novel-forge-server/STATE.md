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

### A2 — Prompt modules + Zod schemas

- 13 Zod schema files in `src/modules/ai/schemas/`: extraction, generation, judge (with .refine), fix (with .refine + patch/rewrite validation), outline (contextRefs ordering), title, continuity, validation, review, new-novel (BibleStageSchema), plan (contiguous-span .refine), skeleton
- 14 prompt modules + 6 bible-builder stages in `src/modules/ai/prompts/`; PROMPT_REGISTRY in index.ts
- AUTHORING_STYLE constant in `authoring-preamble.ts`; generation + revision are `kind:'authoring'`; all others `kind:'analytical'`
- judge has 2 few-shots (CONSISTENT + CONTRADICTION); fix has 1 few-shot (minimal patch)
- PromptModule<TOut>.schema typed as `z.ZodType<TOut, z.ZodTypeDef, unknown>` to allow ZodDefault transforms
- 14 unit tests in `tests/ai/prompts.spec.ts`: AUTHORING_STYLE presence/absence, judge refine behavior, fix refine behavior, plan contiguity refine, extraction parse

### A3 — Model router, telemetry callback, repair ladder

- `MODEL_REGISTRY` in `models.ts`: 12 entries (grok-3/mini/image, claude-sonnet-4-6/haiku, gpt-4o/mini/image-1, qwen3:14b/8b/embedding:8b); `MODEL_MAP` keyed by model id
- `defaults.ts`: `AiRole` (15 roles), `PRODUCTION_DEFAULTS` (xAI grok-3 for all except title→grok-3-mini, embedding→ollama/qwen3:embedding, image→grok-2-image), `LOCAL_TEST_DEFAULTS` (ollama/qwen3 for all)
- `TelemetryHandler` extends `BaseCallbackHandler`; `registerCall` + handleLLMStart/End/Error; writes to `model_calls` table; DB-failure swallowed (just logs)
- `ModelRouterService.resolveModel`: grok_only → xai; per-project config override; fallback to AI_PROFILE defaults
- `ModelRouterService.buildClient`: switch on provider xai/anthropic/openai; ollama throws AI_002 (deferred to A10)
- `ModelRouterService.structured<T>`: 3-attempt repair ladder (raw invoke → repair prompt with priorOutput+parseIssues → tolerant extractJsonBlock fallback); throws AI_001 on all failures
- `@langchain/core` bumped to 1.2.1, `@langchain/anthropic` 1.5.1, `@langchain/openai` 1.5.3 (xai 1.4.3 requires core@^1)
- ChatOllama import deferred (A10); buildClient throws AI_002 for ollama provider in non-A10 builds
- Tests: 12 unit tests in `tests/ai/model-router.spec.ts`; buildClient patched via bracket access so no API key required; 26 total pass, 15 skip, 0 fail

### A4 — ContextAssembler: catalog, ref resolution, budgets, packs

- `token-budget.ts`: `countTokens` (o200k_base), `truncateAtParagraph` (paragraph then word boundary), `applyBudget` (greedy fit)
- `sections.ts`: `ContextSection`/`AssembledPack` types, `SECTION_LABELS` (frozen prompt contract), `renderSection`, `joinSections`
- `CatalogService.render`: 6 parallel queries → compact chapters/volumes/entities/world-facts/threads/mysteries listing
- `ContextAssembler.resolveRefs`: batched by ref type, order-preserving, unknown refs → `unresolved`
- `forChapter`: grok-adjacency rule (summary+state not verbatim tail), FULL_CAST_MAX=5 entity split, budget eviction, SHA-256 dedup upsert into context_packs
- `forOutline`: volume epitomes + catalog; retrieval slot absent (wired in A5)
- `forRevision`: fresh ref resolution + current draft prose + last 5 feedback notes
- `forValidationWindow`: window summaries + touching threads/mysteries/world-facts
- AiModule updated with CatalogService + ContextAssembler providers/exports
- 13 unit tests in `tests/ai/context-assembler.spec.ts`: all 4 acceptance criteria covered; 39 total pass, 15 skip, 0 fail

### A5 — LlamaIndex retrieval: prose + lore indexes

- `chunker.ts`: `chunkText` splits at paragraph boundaries (~2000 chars), sentence-level fallback for oversized paragraphs
- `EmbeddingService`: uses `ollama/browser` Ollama client; `embed`/`embedBatch` best-effort (null on error)
- `IndexingService`: `addProse` (delete then insert chapter_chunks), `deleteProse`, `addLore` (upsert lore_chunks), `backfill` (indexes unindexed done chapters)
- `RetrievalService`: `searchProse` + `searchLore` via raw Drizzle sql pgvector `<=>` cosine distance; grok_only projects return []
- ContextAssembler.forOutline updated to inject retrieval hits (prose_retrieved + lore_retrieved sections)
- RetrievalService optional in ContextAssembler constructor for unit-test safety
- `ai.embeddingModel` config added with default `qwen3-embedding:8b`
- 7 unit tests; 46 total pass, 16 skip, 0 fail

### A6 — Tool registry: 6 read-only tools, loop, audit

- `ReadonlyDb = Pick<PrimaryDatabase, 'query' | 'select'>` — write tools fail at compile time
- 6 `RegisteredTool` consts: search_lore, get_entity, get_chapter_summaries, search_prose, get_world_facts, get_plot_threads
- `ToolRegistryService.forNode(nodeName, ctx)` → `DynamicStructuredTool[]` filtered by allowedNodes; ctx captured in closures; token-truncation applied in wrapper
- `runToolLoop(model, tools, rawTools, messages, ctx, fullDb, opts?)`: maxRounds=6, per-tool call count tracking, audit rows to toolCalls, budget_exceeded/invalid_args/handler_error handled; final unbound invoke after budget exhaustion
- `ToolRegistryService` added to AiModule providers/exports
- 7 unit tests; 53 total pass, 16 skip, 0 fail

## Open issues

<!-- none yet -->
