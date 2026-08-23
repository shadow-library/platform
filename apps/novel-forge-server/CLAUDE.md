# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Backend service for an AI-powered novel generation platform: story bible, world/character/lore management, volume planning, chapter generation with judge/repair loops, human review, continuity validation, and knowledge retrieval. Built with Bun, TypeScript, Fastify via `@shadow-library/app` + `@shadow-library/fastify` (NestJS-like DI), PostgreSQL + Drizzle + pgvector, LangChain/LangGraph/LlamaIndex.TS.

**Current state:** the platform is built out — 62 of the 64 checklist tasks below are complete. The only open items are **CK5** (remaining knowledge follow-ups: web facts panel, `forRevision` sections, arc-planner reveal authoring, bible-audit spoiler check) and **PB5** (the external `novel-forge-reader` service, which lives in its own repo). Treat the checklist below as a completed build log plus those two follow-ups — not a from-scratch plan.

## Source-of-truth documents — read before implementing

- `docs/ai-system-design.md` — the AI subsystem blueprint. Appendix A is a list of hard rules that must never be violated; Appendix B specifies the AI tables.
- `docs/interactive-refinement-design.md` — premise enhancement, bible audit, chat refinement, arc tier, ending-contract briefs, prompt caching. **Adds Appendix A rules 12–13** (its §2 lists all amendments); drives tasks R1–R10.
- `docs/chat-hub-design.md` — the central chat hub: `project` scope, auto/manual modes, per-op cherry-pick, inverse-op revert + rollback, action ops, declared-lookup protocol. **Amends Appendix A rule 2 and adds rule 14** (its §2); drives tasks H1–H6.
- `docs/rebrand-pipeline-design.md` — the automated source-conversion pipeline: glossary/world-map, per-chapter convert + residue scan + audit graph, three-phase `rebrand` job, flag-and-continue semantics; drives tasks RB1–RB6.
- `docs/chapter-recombine-design.md` — merging translator-split chapter parts back into source chapters: title-parsing ladder, AI boundary resolution, transactional renumber + derived-data guard, auto-run hooks; drives tasks RC1–RC2.
- `docs/plan-import-design.md` — offline plan authoring: the `novel-plan-forge` skill's markdown workspace + JSON bundle contract, transactional `plan/import` endpoint with overwrite/approve semantics; drives tasks PI1–PI3.
- `docs/character-knowledge-design.md` — epistemic filtering: `canon_facts` + `character_knowledge` ledger, per-brief `knowledgeContract`, POV-filtered generation context, judge `knowledgeCompliance` + leak pre-scan. **Adds Appendix A rule 15** (its §2); drives tasks CK1–CK5.
- `docs/reader-publish-design.md` — the reader boundary: `publications`/`chapter_publications` ledger, one-way idempotent push to the external `novel-forge-reader` service, stable `publishedOrdinal`, reconcile/rebuild semantics, hard rules (its §9); drives tasks PB1–PB5.
- `docs/reforge-pipeline-design.md` — the re-authoring pipeline: reuses the rebrand rename bible, then extracts a faithful per-chapter outline and re-writes each chapter in the house style (elevating machine-translation prose), with a fidelity judge + deterministic residue scan and flag-and-continue semantics; drives tasks RF1–RF6.
- `docs/novel-import-format.md` — the hand-authored novel-import bundle: a standalone authoring spec (not a design-decision doc — a person can write a bundle from this file alone) for the two-mode (`source`/`final`) supply mechanism that replaced the removed remote-acquisition pipeline; drives task NI1.

Read the doc section referenced by the current task before writing code; do not re-design what the docs already decide.

## Commands

```bash
bun run dev                 # watch-mode server (src/main.ts)
bun test                    # all tests (bunfig.toml enforces 90% coverage)
bun test tests/foo.spec.ts  # single file
bun test -t "pattern"       # single test by name

# From the repo root — no workspace-local type-check/db scripts:
bunx tsc -p apps/novel-forge-server/tsconfig.json --noEmit   # type-check only
bun scripts/db.ts apps/novel-forge-server generate         # drizzle-kit generate → generated/drizzle/
bun scripts/db.ts apps/novel-forge-server migrate           # apply migrations (src/migrate.ts)
bun scripts/db.ts apps/novel-forge-server create-template    # build the template DB the test suite clones
bun scripts/db.ts apps/novel-forge-server seed                # seed local data
bun run ai:smoke            # AI smoke check (tests/ai/ai-smoke.ts)

# from the repo root, by workspace path — this workspace has no build/verify script:
bun scripts/verify.ts apps/novel-forge-server              # format + lint + type-check + test (add --fix to autofix)
bun scripts/build.ts apps/novel-forge-server                # bundle to dist/main.js
```

## Architecture & conventions

- **DI framework:** `@shadow-library/app` modules (`@Module`, `ShadowFactory.create(AppModule)`), NestJS-style controllers/services. HTTP via `FastifyModule.forRoot` in `src/modules/dynamic.modules.ts`; controllers carry explicit full paths (`/api/v1/*`, `/api/auth/*`).
- **Auth:** every HTTP controller is class-level `@Authenticated()` (`@shadow-library/auth/module`); the principal is read via `ContextService` (`getAuthPrincipal().sub` → owner `bigint`) and ownership is enforced by `ProjectOwnershipGuard` / `project-ownership.middleware.ts` (BOLA protection). Browsers authenticate through the first-party session surface the SDK mounts via `AuthModule.forRoot({ routes: { basePath: '/api/auth' } })` in `src/modules/auth/` (login/callback/logout/session/step-up, opaque `__Host-shadow-session` app-session cookie the guard consumes directly — no bearer-promotion middleware). Audience (`api://novel-forge`), redirect URIs and scopes are discovered from identity's `GET /api/v1/apps/me`; the deploy sets only `AUTH_ISSUER` + `AUTH_APP_ID` + a client credential. Tests get tokens from `tests/test-idp.ts`; `TestEnvironment.getRouter()` injects them automatically.
- **Config:** every env key is declared in `src/bootstrap.ts` via `Config.load(...)` with a module augmentation of `ConfigRecords`; read values with `Config.get(...)`, never `process.env`. The datastore is **PostgreSQL only** (`DATABASE_POSTGRES_URL`) — there is no MongoDB, Redis, or Memcached; the AI response cache (`llm_cache`), LangGraph checkpoints, and LlamaIndex vectors all live in Postgres/pgvector.
- **Layout:** `src/modules/<feature>/` for domain modules, `src/modules/ai/` per design-doc §1.4, `src/database/schemas/` for Drizzle schemas. HTTP wiring lives in `src/modules/dynamic.modules.ts` (`HttpCoreModule.forRoot` + `FastifyModule.forRoot` importing every feature module) — there is no `src/routes/` directory.
- **Errors:** extend `AppErrorCode` (`src/classes/app-error-code.ts`, which extends `ServerErrorCode`) via its `notFound`/`badRequest`/`conflict`/`unauthenticated` factories and throw with `.create()`; error-code groups (`PRJ`, `SRC`, `CHP`, `AI`, …).
- **Responses & DB:** bind status + response schema with `@RespondFor(status, Dto)` / `@HttpStatus(n)` and return the plain object (the DTO serializes it — only declared fields leak, `bigint`→string, `Date`→ISO). Services get the Drizzle client via `this.databaseService.getPostgresClient() as PrimaryDatabase` and map constraint violations by chaining `.catch(err => this.databaseService.translateError(err))` on writes.
- **Imports:** preserve the established declaration and named-specifier order. Treat `@shadow-library/*` as external npm packages; `@server/*`, `@modules/*`, and `@tests/*` are internal aliases.
- **File style:** implementation comments explain only non-obvious rationale, constraints, failure ordering, or interoperability details. Do not add section banners, narration, or restatements. Keep useful caller-facing JSDoc on reusable type and option fields; put schema DTO guidance in `@Field` descriptions so API consumers receive it. Prettier: 180 print width, single quotes.
- **Commits:** Conventional Commits enforced by commitlint (`<type>(<scope>): <subject>`, imperative, lowercase, ≤100-char lines). One commit per completed task.

## Development process

Work strictly in checklist order — each task assumes the ones above it. One session may complete one or more tasks, but never start a task you can't leave green.

**Session protocol:**

1. Read this checklist; pick the **first unchecked task**.
2. Read its referenced doc section(s) fully.
3. Implement only that task. If it's too large for one session, finish a coherent sub-step and note remaining work under the checkbox.
4. Verify green: `bun scripts/verify.ts apps/novel-forge-server` (run from the repo root).
5. Tick the checkbox here (and remove any progress note if done), then commit everything with a conventional message.

**Checklist** (M = migration doc §10, A = ai-system-design §10, R = interactive-refinement-design):

- [x] M1 — Project structure & dependencies (migration §10 Phase 1)
- [x] M2 — PostgreSQL schema & Drizzle migrations, template-DB test setup (Phase 2, §6)
- [x] M3 — Core domain modules: projects, chapters, entities, bible CRUD (Phase 3, §5/§7)
- [x] M4 — Repository/persistence semantics: idempotent upserts, state transitions (Phase 4, §5.5)
- [x] A1 — AI data model & migrations incl. checkpointer tables (design §10 A1, Appendix B)
- [x] A2 — Prompt modules + Zod schemas, render goldens (A2, §5)
- [x] A3 — Model router, telemetry callback, repair ladder, `AI_PROFILE` seam (A3, §5.4)
- [x] A4 — ContextAssembler: catalog, ref resolution, budgets, packs (A4, §3)
- [x] A5 — LlamaIndex retrieval: prose + lore indexes (A5, §7)
- [x] A6 — Tool registry: 6 read-only tools, loop, audit (A6, §4)
- [x] A7 — LangGraph workflows + WorkflowRunService (A7, §2)
- [x] A8 — Human review API: feedback/approve/revisions/review-queue/runs endpoints (A8, §6)
- [x] A9 — Job executors, crash recovery, checkpoint janitor (A9)
- [x] A10 — Local LLM test harness: Ollama rung-3 suite + `ai:smoke` (A10, §8)
- [x] A11 — Hardening sweep, CI wiring, observability polish, docs (A11)
- [x] M6 — Source pipeline: extract, consolidate, assets, skeleton (migration Phase 6)
- [x] M7 — Illustration + manuscript modules (non-AI remainder of migration Phase 7)
- [x] M8 — Final verification against migration §12 checklist + design-doc §8.6 command table
- [x] R1 — Refinement schema & error codes: `arcs`, `chat_sessions`, `chat_messages`, `refinement_proposals` tables + `volumes`/`briefs` column additions, enums, `ARC_`/`CHT_`/`RFN_`/`PRM_` codes, `content-hash` util (refinement §3). Verify: migration applies to template DB, schema tests green.
- [x] R2 — Proposal apply engine (no AI): op registry, baseline conflict 409 → `conflicted`, staleness propagation, supersession, proposal endpoints (refinement §6). Verify: transaction tests incl. rollback.
- [x] R3 — Arc module & gates: arc CRUD/approve, `targetChapterCount` volume approve with cumulative chapter mapping, generation precheck (refinement §4, §8). Verify: gate-matrix tests (arc-less vs arc-bearing volumes).
- [x] R4 — Prompt modules: `premise-enhance`, `bible-audit`, `chat-refine` + `SCOPE_PLAYBOOKS`, `chat-compact`, `arc-plan`; `outline`/`generation`/`judge` v2 for ending contracts; roles in both `AI_PROFILE`s; render goldens (refinement §5.2, §9, §11).
- [x] R5 — ContextAssembler: `segment` stable/volatile split, `renderedStable`/`renderedVolatile`, `forChatTurn`/`forArcPlanning`/`forPremise`, purpose budgets (refinement §10.1, §10.3–10.4). Verify: stable segment byte-identical across assemblies with unchanged canon.
- [x] R6 — Router prompt caching: `cacheStrategy` on PromptModule, Anthropic `cache_control` injection at 3 breakpoints, provider no-op matrix (refinement §10.2). Verify: mocked-provider block-injection tests.
- [x] R7 — Chat subsystem: session/message services + endpoints, turn pipeline, history compaction watermark, `WorkflowRunService.runChain` helper (refinement §5). Verify: e2e turn with mocked model.
- [x] R8 — Premise enhance + bible audit: endpoints, `REQUIRED_BIBLE_DOCS` manifest, `audit`/`compact` into `CACHEABLE_ROLES` (refinement §7). Verify: audit idempotence via llm_cache.
- [x] R9 — Arc planner + arc-scoped outline + ending-contract enforcement: `arcs/plan` chain with coverage postValidate, `arcs/:arcKey/outline`, judge → repairPatch routing on `endingCompliance`, staleness clears (refinement §8–9). Verify: coverage-invariant + judge-routing tests.
- [x] R10 — Refinement smoke & polish: rung-3 Ollama chat/arc/premise smoke, `/context/preview` for new purposes, doc cross-links, hardening (refinement §13). Verify: full suite + `ai:smoke`.
- [x] H1 — Chat-hub schema & error codes: `chat_mode` enum + `chat_sessions.mode`, `chat_scope`+`project`, `refinement_kind`+`hub`, proposal columns (`autoApplied`, `opResults`, `inverseOps`, `postState`, `revertedAt`), status +`reverted`, `draft_revision_source`+`chat_edited`, `CHT_004–005`/`RFN_006–011` (chat-hub §3). Verify: baseline migration applies, schema tests green.
- [x] H2 — Op grammar extension: `draft.update`, `brief.remove`, `action.*` vocabulary + validation, `draft:` artifact-state refs, `renderActionVocabulary`, hub playbook + `SCOPE_CHAT_ROLE.project` (chat-hub §4). Verify: grammar unit tests.
- [x] H3 — Apply engine v2: cherry-pick `opIndexes`, inverse-op capture + `postState`, new appliers, `revert`, rollback-to-point, `ActionExecutorRegistry` + `HubActionsModule`, `/revert` `/changes` `/changes/rollback` endpoints (chat-hub §5). Verify: apply/revert round-trip matrix, rollback ordering tests.
- [x] H4 — Hub chat turn v2: `forHubTurn` pack + `chat_hub` budget, chat prompt v2 with declared lookups (max 3 rounds, audited), session `mode` PATCH + hub scope, auto-mode in-turn apply, render goldens (chat-hub §6). Verify: mocked-model e2e both modes + lookup-loop tests.
- [x] H5 — Hub verification sweep: full suite green, doc cross-links, `ai:smoke` still passing (chat-hub §8).
- [x] H6 — Web UI (`novel-forge-web`): hub-first chat screen, mode toggle, per-op proposal cards with diffs + apply-selected, applied/revert cards, action chips, change-history timeline with rollback (chat-hub §7). Verify: web type-check/lint/build green.
- [x] RB1 — Rebrand schema & error codes: `rebrands`/`rebrand_glossary`/`chapter_conversions` tables + 3 enums, `job_kind` +`rebrand`, `RBR_` codes, baseline migration regen, design doc (rebrand §3). Verify: migration applies to template DB, schema tests green.
- [x] RB2 — Rebrand prompt modules: `AiRole 'rebrand'`, `rebrand-glossary`/`rebrand-convert`/`rebrand-audit` prompts + class-schema outputs, registry entries, render goldens (rebrand §4). Verify: prompt suite green.
- [x] RB3 — Rebrand module core: `BANNED_REAL_WORLD_TERMS`, `scanResidue`/`selectGlossarySlice`/`renderGlossarySlice` pure functions, `RebrandService` (config/status/glossary/conversion/manuscript/seedGlossary) (rebrand §2, §7). Verify: residue-scan unit matrix + service template-DB tests.
- [x] RB4 — Chapter-rebrand graph: `forRebrand` context purpose + budget, graph with single-repair routing (`routeAfterAudit`), `runChapterRebrand` (rebrand §5). Verify: route matrix + mocked-router graph runs.
- [x] RB5 — Rebrand job & endpoints: three-phase `runRebrand` executor (flag-and-continue), rebrand controller/DTOs wired via `PipelineModule` (rebrand §6–7). Verify: executor + controller e2e tests.
- [x] RB6 — Web UI (`novel-forge-web`): rebrand panel — config, start + progress, chapter status list, original/converted reader toggle, re-run, manuscript download (rebrand §8). Verify: web type-check/build green.
- [x] RC1 — Recombine core: `chapters.mergedFrom` column, `SRC_002`/`SRC_003`, `title-parts` detection ladder, `RecombineService` (guards, transactional merge + renumber, dry-run), `POST /recombine` (recombine §2, §4). Verify: parser matrix + service/e2e tests green.
- [x] RC2 — Recombine AI + auto-run: `recombine` prompt + schema + registry, `useAi` boundary resolution (chunked, default split), executor hooks in rebrand/reforge phase 1.5 (recombine §1, §3). Verify: mocked-router + executor ordering tests green.
- [x] WN — Reference-title catalog feature (recombine §5) was removed together with the remote-acquisition pipeline; source projects no longer sync chapter titles from an external catalog.
- [x] PI1 — Plan-import module: bundle DTOs, pure `validatePlanBundle` cross-item validator, transactional import service (overwrite prune, approval pass), `POST /plan/import`, `IMP_` codes, `renderBriefBody` moved to `src/common` (plan-import §1–5). Verify: validator matrix + template-DB e2e import/idempotence/approve tests.
- [x] PI2 — Web UI (`novel-forge-web`): "Import plan" screen — bundle picker with count preview, overwrite/approve toggles, per-collection result chips, warnings + field-error lists (plan-import §6). Verify: web type-check/lint/build green.
- [x] PI3 — Authoring skill (external, `~/.claude/skills/novel-plan-forge/`): SKILL.md process, workspace templates, zero-dep `pack.mjs` targeting the §2 bundle (plan-import §7). Verify: packed example workspace imports cleanly against a local server.
- [x] CK1 — Knowledge schema & error codes: `canon_facts` + `character_knowledge` tables, `fact_source` enum, `briefs.knowledgeContract` column, `FCT_` codes, baseline migration regen (character-knowledge §3). Verify: migration applies to template DB, schema tests green.
- [x] CK2 — Fact module: `src/modules/bible/fact/` CRUD + reveal/retract endpoints, `knowledge-view` pure helpers + `scanKnowledgeLeaks`, reveal-on-approve hook in `approveDraft` (character-knowledge §4, §7). Verify: pure-fn matrix + template-DB service/e2e tests incl. reveal idempotence.
- [x] CK3 — Context assembly: `known_facts`/`chapter_reveals`/`hidden_constraints` sections in `forChapter`, section labels, generation prompt v2.2 epistemic rule + goldens (character-knowledge §5). Verify: assembler tests — contract-bearing vs contract-less briefs, hidden fact text never in rendered pack.
- [x] CK4 — Judge gate: `knowledgeCompliance` schema + judge prompt bump, `## FORBIDDEN KNOWLEDGE` block, pre-scan merge, `knowledgeCompliant` routing in `routeAfterJudge` (character-knowledge §6). Verify: routing matrix + judge-node merge tests.
- [ ] CK5 — Follow-ups: plan-import `facts` collection + brief `knowledgeContract`, `novel-plan-forge` skill update, web facts panel, `forRevision` sections, arc-planner reveal authoring (character-knowledge §8).
  - Done: bundle v2 (`facts` + brief `knowledgeContract`) in DTO/validator/import service, `knowledgeContract` in `BRIEF_HASH_FIELDS`, skill updated with fact authoring + migration guide. Web (`novel-forge-web`): Canon Facts panel (`src/routes/novels/$novelId/canon-facts.tsx`) — list with hidden/revealed state, create/edit, delete, reveal/retract, blurred-by-default truth text; the import-plan screen and its `ImportPlanResponse`/`CollectionResult` DTO already carried a `facts` result chip from the CK5 bundle work, so no server change was needed there; hub proposal target-label chain now includes `op.factKey`.
  - Remaining: `forRevision` knowledge sections, arc-planner reveal authoring, bible-audit spoiler check.
- [x] PB1 — Publishing schema & error codes: `publications` + `chapter_publications` ledger tables, 2 enums, `PUB_` codes, baseline migration regen (reader-publish §3). Verify: migration applies to template DB, schema tests green.
- [x] PB2 — Publishing module: publish/schedule/unpublish gates (`PUB_002`/`PUB_003`), once-only `publishedOrdinal` assignment, reader-clean payload renderer, `PublishingService` + controller/DTOs (reader-publish §4–5). Verify: gate matrix + template-DB tests incl. ordinal stability under renumber.
- [x] PB3 — Push executor & reconciliation: `publish` job kind, bearer-auth HTTP client, ledger-as-outbox retry + janitor sweep, manifest-diff `reconcile` endpoint (reader-publish §5–6). Verify: mocked reader-service e2e, retry idempotence, wipe-and-rebuild convergence test.
- [x] PB4 — Web UI (`novel-forge-web`): publish panel — novel metadata editor, per-chapter publish/schedule/republish/unpublish with ledger status chips, reconcile action (reader-publish §7). Verify: web type-check/lint/build green.
- [ ] PB5 — Reader service (external repo `novel-forge-reader`): scaffold per reader-publish §8 — internal upsert/manifest API, public catalog/chapter/progress API, ETag-first caching. Verify: forge e2e publish → read round-trip against the local reader service.
- [x] RF1 — Reforge schema & error codes: `reforges` + `chapter_reforges` tables, `reforge_status`/`reforge_chapter_status`/`reforge_fidelity` enums, `job_kind` +`reforge`, `REF_` codes, baseline migration regen, design doc (reforge §3). Verify: migration applies to template DB, schema tests green.
- [x] RF2 — Reforge prompt modules: `AiRole 'reforge'`, `reforge-outline`/`reforge-write` (role reforge) + `reforge-judge` (role judge) prompts + class-schema outputs, registry entries, render goldens (reforge §4). Verify: prompt suite green.
- [x] RF3 — Reforge context purposes: `forReforgeOutline` + `forReforge` packs, `REFORGE_OUTLINE_BUDGET`/`REFORGE_BUDGET`, stable/volatile split (reforge §5). Verify: assembler tests — stable segment byte-identical across assemblies with unchanged canon.
- [x] RF4 — Chapter-reforge graph: outline → write → residueScan → judge with single-repair routing (`routeAfterFidelityJudge` — renamed from the doc's `routeAfterJudge` to avoid the shared-barrel clash with chapter-generation's), `sourceBeats` persistence, `runChapterReforge` (reforge §6). Verify: route matrix + mocked-router graph runs.
- [x] RF5 — Reforge job & endpoints: three-phase `runReforge` executor (flag-and-continue, reuses recombine/seedGlossary), reforge controller/DTOs wired via `PipelineModule` (reforge §7). `ReforgeModule` imports only `DatabaseModule` — the executor already owns `seedGlossary` via the wired `RebrandService`, so no `ReforgeModule → RebrandModule` edge is needed (keeps the graph acyclic). Verify: executor + controller e2e tests.
- [x] RF6 — Web UI (`novel-forge-web`): reforge panel — config (instructions, fidelity, judge toggle), start + progress, chapter status list, source/reforged reader toggle, re-run, manuscript download (reforge §8). Verify: web type-check/build green.
- [x] NI1 — Novel-import module: hand-authored, versioned two-mode (`source`/`final`) bundle format — `src/modules/novel-import/` (dto/validator/service/controller/module/barrel, mirroring plan-import), `POST /api/v1/import` (creates the project + enqueues transactionally), `import` job kind + `JobExecutor.runImport` (batched chapter insert with progress, cover storage via the shared `ImageStorageProvider`, `source` mode re-runs `RecombineService.autoRecombine`, `final` mode lands locked/human/publish-ready chapters), baseline migration regen, `docs/novel-import-format.md` — the standalone authoring spec (novel-import-format.md). This is the supply mechanism source projects now use for their chapters, replacing the removed remote-acquisition pipeline (WN). Verify: pure-validator matrix + executor progress/failure tests + e2e import/publish-path tests green.
- [x] NI2 — Web UI (`novel-forge-web`): bundle upload screen — file picker for a hand-packed `novel-import` bundle, mode indicator, field-error list on a 422, progress tracking via the existing jobs endpoints. Separate follow-up in the web repo.

**Non-negotiables in every session:** the hard rules in `docs/ai-system-design.md` Appendix A; never leave the tree red or half-migrated; prefer deterministic service code over AI calls.
