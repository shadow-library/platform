# Rebrand Pipeline Design

A fully-automated conversion pipeline for source projects: it takes the scraped source novel and produces a "rebranded" version — de-nationalized, renamed into a
fictional alternate world, copy-edited — with optional directive-driven scene insertion. One POST runs everything with zero human intervention. This doc drives
tasks RB1–RB6 in CLAUDE.md and follows the conventions of `ai-system-design.md` (its Appendix A hard rules apply unchanged).

## 1. Goals & decisions

1. **De-nationalize** — remove all nationalism and discrimination based on country/ethnicity/skin color; rewritten passages keep their plot function.
2. **Rename** — every Chinese/pinyin proper noun (characters, places, countries, cultures, sects, techniques, currencies, idioms) maps to an English/alternate-world
   name; real countries and cultures never appear in output.
3. **Copy-edit** — fix source defects (misspelled names, wrong-person attributions, translation-artifact grammar) with a light touch; story content, scene order and
   dialogue meaning are preserved.
4. **Optional scene insertion** — a free-text directive on the rebrand config (e.g. "weave romance in") licenses added scenes, with cross-chapter continuity carried
   in a per-chapter `carryState` (the drafts `state` precedent).
5. **Fully automatic** — the job finishes acquisition if needed, seeds the glossary, then converts every chapter ascending. Crash-resumable at every step;
   per-chapter failures flag-and-continue (status `failed`/`attention`), never block on a human.

Fixed decisions: converted chapters live **side-by-side** in the same project (`chapter_conversions`; source rows untouched); quality gate is a **deterministic
residue scan + one AI audit call** per chapter with a single repair attempt; scope includes a minimal web UI.

## 2. Consistency backbone — the glossary

`rebrand_glossary` maps each source proper noun (plus spelling/romanization `variants`) to exactly one replacement. Seeded once by an AI pass (world notes + initial
mappings from premise, entity roster and opening chapters); grown monotonically as conversion discovers new names (`discoveredNames` merged with
insert-conflict-keeps-existing — a mapping is never rewritten once made). Variants are how misspellings collapse to one canonical target name.

Deterministic where possible (repo rule):

- **Glossary-slice selection** — string-scan the chapter for known source names/variants (and replacements, which repair/audit passes need); include only matches,
  plus always every `country`/`culture` entry. Slices are ordered by match count so budget truncation drops the rarest names first.
- **Residue scan** — post-conversion: leftover glossary source names/variants (case-sensitive word boundaries, min length 3, identity mappings skipped), CJK
  characters, and banned real-world terms (`BANNED_REAL_WORLD_TERMS` + per-project `settings.bannedExtra`, case-insensitive).
- **Glossary merge** — pure inserts, `onConflictDoNothing`.

AI is used only for: glossary seed, per-chapter convert, per-chapter audit.

## 3. Schema (`src/database/schemas/rebrand.ts`)

- `rebrands` — one per project: `status` (`rebrand_status`: pending|ingesting|glossary|converting|done|failed — advisory display only; resume derives the real phase
  from `scrapeComplete`, `worldNotes` and conversion rows), `directives`, `worldNotes` (null = unseeded), `settings` jsonb (`{bannedExtra?, auditEnabled?}`),
  `lastError`. Unique on `projectId`.
- `rebrand_glossary` — `sourceName` (unique with `projectId`), `variants` jsonb string[], `replacement`, `category` (`rebrand_glossary_category`:
  character|place|country|culture|faction|technique|item|term), `notes`, `createdChapter` (0 = seeded, N = discovered converting chapter N).
- `chapter_conversions` — unique (`projectId`, `chapter`): `title`, `body` (`''` sentinel on failed rows), `summaryOfChanges`, `fixes`, `addedScenes`, `carryState`,
  `status` (`rebrand_conversion_status`: converted|attention|failed), `issues` jsonb (`[{source: 'residue'|'audit'|'run', type, detail, excerpt?}]`),
  `glossaryCount`, `runId`, `revision` (+1 per re-conversion).

`job_kind` gains `'rebrand'`. Error codes: `RBR_001` (rebrand not configured, 404), `RBR_002` (converted chapter not found, 404), `RBR_003` (source projects only,
400).

## 4. Prompts & roles

New `AiRole` `'rebrand'` → `writing` group (both profiles derive automatically). Three prompt modules:

- `rebrand-glossary` — analytical, role `rebrand`. Designs the rename bible: invents fictional nations/cultures for every real-world reference, maps every pinyin
  proper noun (phonetic echo allowed), lists romanization variants/likely misspellings, and writes `worldNotes` that brief a future rewriter (geography, per-culture
  naming conventions, what replaced China/the West, tone). Vars: `{contextPack}`, `{openingChapters}`.
- `rebrand-convert` — authoring, role `rebrand`, `cacheStrategy: {stableVars: ['contextPack']}`. Applies the glossary exactly; removes nationalism/discrimination
  while preserving the beat; copy-edits lightly (the style preamble governs only newly inserted material); weaves directives with carry-state continuity; reports
  `discoveredNames`, `fixes`, `addedScenes`, updated `carryState`. A `repairNotes` var turns it into a fix-exactly-these-issues pass. Vars: `{contextPack}`,
  `{chapterProse}`, `{repairNotes}`.
- `rebrand-audit` — analytical, role `audit` (review group; in `CACHEABLE_ROLES`, so identical re-audits hit `llm_cache`). Reports only leftover
  nationalism/discrimination, real-world references, and naming inconsistency vs the glossary slice/world notes; verdict `clean` otherwise; no prose critique.
  Vars: `{worldNotes}`, `{glossarySlice}`, `{convertedProse}`.

Output schemas are `@shadow-library/class-schema` classes in `src/modules/ai/schemas/rebrand.schema.ts` (`RebrandGlossarySeedSchema`, `RebrandConvertSchema`,
`RebrandAuditSchema` with verdict/issues agreement in postValidate).

## 5. Chapter-rebrand graph (`src/modules/ai/graphs/chapter-rebrand.graph.ts`)

Clones the `source-extraction` precedent: checkpointed per-chapter graph, one `workflow_runs` row, thread-id resume.

```
loadChapter → assembleContext → convert → residueScan → audit ─┬→ persistConversion → mergeGlossary → finish
                                   ↑ (dirty & attempt 0)       │
                                   └────────── repair ─────────┘
```

- `loadChapter` — source chapter, rebrands row, full glossary, previous conversion (carry-state + prev tail come from the previous **converted** body — never the
  source tail, which would leak pre-rebrand names and break inserted-thread continuity).
- `assembleContext` — `ContextAssembler.forRebrand` (purpose `'rebrand'`, 12k budget): `world_notes` + `directives` stable, `glossary_slice` + `carry_state` +
  `prev_ending` volatile. Chapter prose is a separate template var, NOT in the pack, keeping the stable segment byte-identical for provider caching.
- `audit` — skipped when `settings.auditEnabled === false`; the deterministic residue scan always runs.
- `routeAfterAudit` (exported pure router) — clean → persist; dirty & attempt 0 → one repair pass through `convert` with rendered `repairNotes`; still dirty →
  persist as `attention` with merged issues.
- `mergeGlossary` — runs even for attention rows (later chapters need the discovered names).

`WorkflowRunService.runChapterRebrand({projectId, chapter, jobId?})` wraps the graph per precedent.

## 6. Rebrand job (`JobExecutor.runRebrand`)

Kind `'rebrand'`, payload `{chapters?: number[], force?: boolean, limit?: number}`. Three phases, each derived from data (never from `rebrands.status`, which is
updated at phase boundaries for display only):

1. **Acquire** — loop `AcquireService.ingest` until `scrapeComplete`. A stalled loop (0 pages ingested, still incomplete) throws — pre-conversion, blocking is
   correct. Once complete, the recombine pass runs (`RecombineService.autoRecombine`, see `chapter-recombine-design.md`) to merge translator-split chapter parts
   before anything downstream sees them; its guards make it a safe no-op on already-processed projects.
2. **Glossary** — `RebrandService.seedGlossary` (no-op when `worldNotes` is already set).
3. **Convert** — target chapters = `payload.chapters` ?? source chapters minus existing `converted`/`attention` conversions (`failed` always retried); `force`
   reconverts everything; `limit` caps the batch for trial runs. Chapters run ascending, serial. A failed run upserts a `failed` conversion row with the error in
   `issues` and **continues** — a deliberate divergence from `runExtract`'s throw; the pipeline must never block.

Resume recomputes the remaining chapters from the DB on every run; the chapter list is never cached in the payload.

## 7. HTTP API (`src/modules/rebrand/`, controller registered in `PipelineModule`)

- `PUT /projects/:projectId/rebrand/config` — directives/settings (creates the row via getOrCreate; `RBR_003` unless project kind is `source`).
- `POST /projects/:projectId/rebrand` — 202; enqueue kind `rebrand`, target `rebrand-{projectId}`; fire-and-forget dispatch.
- `GET /projects/:projectId/rebrand` — rebrand row + conversion counts by status + `scrapeComplete` + glossary count + latest rebrand-job progress.
- `GET /projects/:projectId/rebrand/glossary` — list (category/page/limit).
- `GET /projects/:projectId/rebrand/chapters/:chapter` — conversion row (`RBR_002`).
- `POST /projects/:projectId/rebrand/chapters/:chapter` — 202; single-chapter re-run (target `rebrand-{projectId}-ch-{chapter}`, payload
  `{chapters: [n], force: true}`; distinct target coexists with the full job, the per-project lock serializes them).
- `GET /projects/:projectId/rebrand/manuscript` — `# title\n\nbody` join of `converted`+`attention` rows ascending.

`RebrandModule` imports `DatabaseModule` + `AiModule` only; `JobsModule` imports `RebrandModule` (executor dependency); the controller lives in `PipelineModule` —
same no-circular-deps seam as the source pipeline.

## 8. Web UI (novel-forge-web)

`src/lib/apis/rebrand.api.ts` (hand-written types + TanStack hooks; status polls every 2.5s while a job is in progress) and `src/routes/novels/$novelId/rebrand.tsx`:
config card (directives, extra banned terms, audit toggle), start card (progress + converted/attention/failed chips), chapter list with status chips → reader with
Original/Converted toggle and per-row re-run, manuscript download. Sidebar entry for source projects only.

## 9. Risks

- **Pinyin surnames that are English words** ("Long", "Fang") cause residue false positives → spurious `attention` rows. Acceptable — attention never blocks; add a
  skip flag if it bites.
- **Cost is output-token dominated** (full rewritten chapter per call, ×2 on repair, + audit input). `limit` enables trial runs; `auditEnabled: false` halves calls.
- **Glossary drift** is bounded to the discovering chapter (serial ascending order + merge after every chapter).
- **AUTHORING_STYLE tension** — if early conversions restyle the prose, bump `rebrand-convert` with stronger preservation wording (never flip its kind).

## 10. Verification

Per task: `bun run type-check && bun run lint && bun test` (server) / type-check + build (web). Mocked-model suites cover the graph and executor end-to-end. Live
smoke: small source project → `PUT config` with a directive → `POST rebrand` with `{limit: 3}` → watch `GET /rebrand` → inspect `chapter_conversions`,
`rebrand_glossary`, `model_calls` → `GET /manuscript`.
