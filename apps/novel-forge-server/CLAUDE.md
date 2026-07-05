# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Backend service for an AI-powered novel generation platform: story bible, world/character/lore management, volume planning, chapter generation with judge/repair loops, human review, continuity validation, and knowledge retrieval. Built with Bun, TypeScript, Fastify via `@shadow-library/app` + `@shadow-library/fastify` (NestJS-like DI), PostgreSQL + Drizzle + pgvector, LangChain/LangGraph/LlamaIndex.TS.

**Current state:** bare scaffold (health endpoint only). The entire product is built by working through the checklist below.

## Source-of-truth documents — read before implementing

- `docs/python-cli-to-node-api-migration-plan.md` — product behavior, schema, API, jobs/concurrency. Its §1.1 decisions override everything else.
- `docs/ai-system-design.md` — the AI subsystem blueprint. **Supersedes migration-doc §8** and the AI parts of Phases 5/7. Appendix A is a list of hard rules that must never be violated; Appendix B specifies the AI tables.

Read the doc section referenced by the current task before writing code; do not re-design what the docs already decide.

## Commands

```bash
bun run dev                 # watch-mode server (src/main.ts)
bun run type-check          # tsc, no emit
bun run lint                # prettier + eslint (add --fix to autofix)
bun run build               # bundle to dist/
bun test                    # all tests (bunfig.toml enforces 90% coverage)
bun test tests/foo.spec.ts  # single file
bun test -t "pattern"       # single test by name
```

## Architecture & conventions

- **DI framework:** `@shadow-library/app` modules (`@Module`, `ShadowFactory.create(AppModule)`), NestJS-style controllers/services. HTTP via `FastifyModule.forRoot` in `src/routes/`.
- **Config:** every env key is declared in `src/bootstrap.ts` via `Config.load(...)` with a module augmentation of `ConfigRecords`. Note: the scaffold's `db.uri` default is MongoDB — Phase 2 replaces it with PostgreSQL.
- **Layout:** `src/modules/<feature>/` for domain modules, `src/modules/ai/` per design-doc §1.4, `src/database/schemas/` for Drizzle schemas, `src/routes/` for HTTP wiring.
- **Errors:** extend `AppErrorCode` (`src/classes/app-error-code.ts`); error code groups per migration-doc §7.6.
- **Imports:** use the `@server/*` alias for `src/*` in tests; source files use relative imports.
- **File style:** every source file uses the section banner comments (`Importing packages with side effects` / `Importing npm packages` / `Importing user defined packages` / `Defining types` / `Declaring the constants`) — match the existing files. Prettier: 180 print width, single quotes.
- **Commits:** Conventional Commits enforced by commitlint (`<type>(<scope>): <subject>`, imperative, lowercase, ≤100-char lines). One commit per completed task.

## Development process

Work strictly in checklist order — each task assumes the ones above it. One session may complete one or more tasks, but never start a task you can't leave green.

**Session protocol:**

1. Read this checklist; pick the **first unchecked task**.
2. Read its referenced doc section(s) fully.
3. Implement only that task. If it's too large for one session, finish a coherent sub-step and note remaining work under the checkbox.
4. Verify green: `bun run type-check && bun run lint && bun test`.
5. Tick the checkbox here (and remove any progress note if done), then commit everything with a conventional message.

**Checklist** (M = migration doc §10, A = ai-system-design §10):

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
- [x] M6 — Source pipeline: acquire, extract, consolidate, assets, skeleton (migration Phase 6)
- [x] M7 — Illustration + manuscript modules (non-AI remainder of migration Phase 7)
- [ ] M8 — Final verification against migration §12 checklist + design-doc §8.6 command table

**Non-negotiables in every session:** the hard rules in `docs/ai-system-design.md` Appendix A; migration-doc §1.1 decisions; never leave the tree red or half-migrated; prefer deterministic service code over AI calls.
