# Reforge Pipeline Design

An automated **re-authoring** pipeline for source projects. Where the rebrand pipeline (`rebrand-pipeline-design.md`) renames + de-nationalizes + *lightly copy-edits* while preserving the source prose, reforge goes one step further: it treats each source chapter as a **faithful outline** and **re-writes it from scratch in the house style**, so the machine-translation quality of the source no longer bounds the quality of the output. The result keeps the same plot, storyline, characters, and dialogue *meaning*, removes the content the author does not want, applies the rebrand rename bible, and reads as originally-authored prose. One POST runs everything with zero human intervention. This doc drives tasks RF1–RF6 in CLAUDE.md and follows the conventions of `ai-system-design.md` (its Appendix A hard rules apply unchanged).

Reforge is a strict superset of rebrand in intent but a different mechanism: rebrand *preserves* the source text; reforge *regenerates* it. The two coexist side-by-side on the same source project — `chapter_conversions` (rebrand) and `chapter_reforges` (reforge) never touch each other or the untouched source rows.

## 1. Goals & decisions

1. **Faithful adaptation** — preserve the plot, storyline, scene order, character arcs, and dialogue *meaning* of each source chapter. Dialogue is re-prosed, not transcribed: the intent and information of each key line survives, the wording is re-authored.
2. **Rename + de-nationalize** — reuse the rebrand rename bible (`rebrand_glossary` + `rebrands.worldNotes`) unchanged: every mapped source name becomes its replacement, real countries/cultures never appear, nationalism/discrimination is removed. No second glossary is invented.
3. **Remove unpreferred content** — the author declares, in `reforges.instructions`, what to cut (filler arcs, problematic content, undesired subplots, repetitive padding). The writer drops it and repairs the surrounding beat so the chapter still flows. Declared removals are exempt from the fidelity judge's "dropped a beat" check.
4. **Elevate prose** — unlike `rebrand-convert` (whose style preamble governs only *inserted* material), reforge re-authors the *entire* chapter under `AUTHORING_STYLE` + the project's writing instructions. This is the whole point: bad MTL prose is replaced, not patched.
5. **Fidelity gate** — a deterministic residue scan (reused from rebrand) plus one AI **fidelity judge** call per chapter check beat coverage, naming consistency, and removal compliance. Prose *taste* is deliberately NOT a gate (the writer owns quality; gating on subjective quality causes repair thrash — same reasoning as `rebrand-audit`). One repair attempt, then flag-and-continue.
6. **Fully automatic & crash-resumable** — the job finishes acquisition, recombines split parts, seeds the shared glossary, then reforges every chapter ascending. Per-chapter failures flag-and-continue (`failed`/`attention`), never block on a human — identical semantics to the rebrand job.

Fixed decisions: reforged chapters live **side-by-side** (`chapter_reforges`; source + rebrand rows untouched); the rename backbone is **shared with rebrand** (reforge calls `RebrandService.seedGlossary`, idempotent); fidelity defaults to **`preserve`** (preserve meaning, re-prose fully); scope includes a minimal web UI.

## 2. Reuse of the rebrand backbone (no duplication)

Reforge owns the *regeneration* concern only; everything about the alternate-world rename is borrowed:

- **Rename bible** — `rebrand_glossary` + `rebrands.worldNotes`, seeded by the existing `RebrandService.seedGlossary` (idempotent; getOrCreates the `rebrands` row and derives world notes + mappings from the premise, entity roster, world facts, and opening chapters). Reforge phase 2 calls it; a project that already ran rebrand re-uses the seeded glossary as-is.
- **Deterministic residue scan** — `scanResidue` / `selectGlossarySlice` / `renderGlossarySlice` are reused verbatim; a reforged chapter is scanned for leftover source names, CJK, and banned real-world terms exactly like a converted one.
- **Directives** — `rebrands.directives` (scene weaving) still apply when present; `reforges.instructions` is the reforge-specific channel for prose preferences and content removal.
- **Glossary growth** — proper nouns the writer had to rename that aren't yet in the glossary are reported in `discoveredNames` and merged with the same monotonic insert-conflict-keeps-existing rule, so later chapters stay consistent.

AI is used for: glossary seed (rebrand's), per-chapter **outline**, per-chapter **write**, per-chapter **fidelity judge**.

## 3. Schema (`src/database/schemas/reforge.ts`) — RF1

- `reforges` — one per project (unique `projectId`): `status` (`reforge_status`: pending|ingesting|glossary|reforging|done|failed — advisory display only; resume derives the real phase from `scrapeComplete`, `rebrands.worldNotes` and reforge rows), `instructions` (author's prose + removal guidance), `fidelity` (`reforge_fidelity`: preserve|close|loose, default `preserve`), `settings` jsonb (`{judgeEnabled?, targetWords?}`), `lastError`.
- `chapter_reforges` — unique (`projectId`, `chapter`): `title`, `body` (`''` sentinel on failed rows), `summary`, `sourceBeats` jsonb (the faithful outline the writer worked from — the fidelity anchor, kept for audit/repair), `changes` jsonb (`{renames, removals, addedScenes, proseNotes}`), `fidelity` jsonb (judge verdict: `{verdict, coveredBeats, missingBeats, drift, naming}`), `carryState` jsonb, `status` (`reforge_chapter_status`: reforged|attention|failed), `issues` jsonb (`[{source: 'residue'|'fidelity'|'run', type, detail, excerpt?}]`), `wordCount`, `runId`, `revision` (+1 per re-reforge).

`job_kind` gains `'reforge'`. Error codes: `REF_001` (reforge not configured, 404), `REF_002` (reforged chapter not found, 404), `REF_003` (source projects only, 400). Baseline migration regenerated; template DB rebuilt.

## 4. Prompts & roles — RF2

New `AiRole` `'reforge'` → `writing` group (both profiles derive automatically). Three prompt modules + one reused role (`judge`):

- `reforge-outline` — analytical, role `reforge`. Reads the source chapter prose and the glossary slice; emits a faithful, ordered scene/beat outline: each beat's purpose, the participating (renamed) entities, the emotional turn, and dialogue anchors (key lines captured by *meaning*, not verbatim). This outline is the fidelity contract every downstream check measures against. Vars: `{contextPack}`, `{chapterProse}`.
- `reforge-write` — authoring, role `reforge`, `cacheStrategy: {stableVars: ['contextPack']}`. Writes a complete, high-quality chapter *from the outline* under `AUTHORING_STYLE` + project instructions; applies the glossary exactly; removes what `instructions` says to cut and repairs the seam; weaves `directives` with carry-state continuity; improves prose freely because it is authoring, not copy-editing. Reports `discoveredNames`, `changes`, updated `carryState`. A `repairNotes` var turns it into a fix-exactly-these-issues pass. Vars: `{contextPack}`, `{outline}`, `{repairNotes}`.
- `reforge-judge` — analytical, role `judge`. Given the outline and the written chapter, reports only: (a) missing/invented **major** beats vs the outline, excluding beats the `instructions` declared removed; (b) naming inconsistency vs the glossary slice / world notes; (c) leftover nationalism/discrimination or real-world references. Verdict `clean` otherwise. Explicitly does **not** critique prose quality, pacing, or word choice. Vars: `{outline}`, `{glossarySlice}`, `{worldNotes}`, `{writtenProse}`.

Output schemas are `@shadow-library/class-schema` classes in `src/modules/ai/schemas/reforge.schema.ts` (`ReforgeOutlineSchema`, `ReforgeWriteSchema`, `ReforgeJudgeSchema` with verdict/issue agreement in postValidate). Render goldens per the prompt-suite convention.

## 5. Context — RF3

Two purposes on `ContextAssembler`, both budgeted and pack-persisted:

- `forReforgeOutline(projectId, chapter, {worldNotes, glossarySlice})` — packs `world_notes` (stable) + `glossary_slice` (volatile). Source prose is a separate template var, never in the pack (keeps the stable segment byte-identical for caching, per refinement §10.2).
- `forReforge(projectId, chapter, {worldNotes, directives, instructions, glossarySlice, carryState, prevBody})` — packs `world_notes` + `directives` + `instructions` (stable) and `glossary_slice` + `carry_state` + `prev_ending` (volatile). `prev_ending` is the tail of the previous **reforged** body (never the source tail — it would leak pre-rename names and break re-authored continuity). The outline is a separate template var.

`REFORGE_OUTLINE_BUDGET` and `REFORGE_BUDGET` mirror the rebrand budgets (~12k) with room for the outline.

## 6. Chapter-reforge graph (`src/modules/ai/graphs/chapter-reforge.graph.ts`) — RF4

Clones the `chapter-rebrand` precedent: checkpointed per-chapter graph, one `workflow_runs` row, thread-id resume.

```
loadChapter → outlineContext → outline → writeContext → write → residueScan → judge ─┬→ persist → mergeGlossary → finish
                                            ↑ (dirty & attempt 0)                     │
                                            └──────────────── repair ─────────────────┘
```

- `loadChapter` — source chapter, `reforges` row, `rebrands` row (world notes/directives), full glossary, previous reforge (carry-state + prev tail from the previous **reforged** body).
- `outline` — one `reforge-outline` call over the source prose; the result is persisted to `chapter_reforges.sourceBeats` even on later failure, so a repair or re-run never re-outlines needlessly.
- `write` — one `reforge-write` call from the outline; on repair, the same node runs with rendered `repairNotes`.
- `judge` — skipped when `settings.judgeEnabled === false`; the deterministic residue scan always runs.
- `routeAfterJudge` (exported pure router) — clean → persist; dirty & attempt 0 → one repair pass through `write`; still dirty → persist as `attention` with merged issues.
- `mergeGlossary` — runs even for attention rows (later chapters need discovered names).

`WorkflowRunService.runChapterReforge({projectId, chapter, jobId?})` wraps the graph per precedent.

## 7. Reforge job & HTTP API — RF5

`JobExecutor.runReforge`, kind `'reforge'`, payload `{chapters?: number[], force?: boolean, limit?: number}`. Phases derived from data, never from `reforges.status`:

1. **Acquire** — loop `AcquireService.ingest` until `scrapeComplete`; then `webnovelCatalog.autoSync` + `recombineService.autoRecombine` (shared with rebrand phase 1/1.5).
2. **Glossary** — `RebrandService.seedGlossary` (no-op when world notes already set).
3. **Reforge** — targets = `payload.chapters` ?? source chapters minus existing `reforged`/`attention` rows (`failed` always retried); `force` re-reforges everything; `limit` caps trial runs. Serial ascending; a failed run upserts a `failed` row and continues.

`src/modules/reforge/` (controller registered in `PipelineModule`; `ReforgeModule` imports `DatabaseModule` + `AiModule` + `RebrandModule` for `seedGlossary` and the residue helpers; `JobsModule` imports `ReforgeModule`):

- `PUT /projects/:projectId/reforge/config` — instructions/fidelity/settings (getOrCreate; `REF_003` unless kind is `source`).
- `POST /projects/:projectId/reforge` — 202; enqueue kind `reforge`, target `reforge-{projectId}`.
- `GET /projects/:projectId/reforge` — reforge row + chapter counts by status + `scrapeComplete` + glossary count + latest reforge-job progress.
- `GET /projects/:projectId/reforge/chapters/:chapter` — reforge row (`REF_002`).
- `POST /projects/:projectId/reforge/chapters/:chapter` — 202; single-chapter re-run (`{chapters:[n], force:true}`).
- `GET /projects/:projectId/reforge/manuscript` — `# title\n\nbody` join of `reforged`+`attention` rows ascending.

## 8. Web UI (novel-forge-web) — RF6

`src/lib/apis/reforge.api.ts` + `src/routes/novels/$novelId/reforge.tsx`: config card (instructions, fidelity select, judge toggle, target words), start card (progress + reforged/attention/failed chips), chapter list with status chips → reader with Source/Reforged toggle and per-row re-run, manuscript download. Sidebar entry for source projects only. Mirrors the rebrand panel.

## 9. Risks

- **Fidelity drift** — a re-author can silently drop or invent beats. Mitigated by the outline anchor (the writer works from a faithful outline, not free memory) + the fidelity judge measuring coverage against it. Residual risk: the outline itself omits a beat → carries through. Acceptable; attention rows never block.
- **Cost** — outline + write + judge (+ optional repair write) is 3–4 model calls per chapter, output-token dominated (two full chapter-length generations on repair). `limit` enables trial runs; `settings.judgeEnabled: false` drops the judge call.
- **Over-aggressive removal** — vague `instructions` may cut beats the judge then flags as missing; the author narrows the instruction and re-runs the chapter.
- **Reuse coupling** — reforge depends on `RebrandService.seedGlossary`; the `ReforgeModule → RebrandModule` import must stay one-directional (Rebrand must not import Reforge). Same no-circular-deps seam as the source pipeline.

## 10. Verification

Per task: `bun run verify` (server) / type-check + build (web). Mocked-model suites cover the graph and executor end-to-end; the pure `routeAfterJudge` router has a route matrix. Live smoke: small source project → `PUT config` with instructions → `POST reforge` `{limit: 3}` → watch `GET /reforge` → inspect `chapter_reforges`, `model_calls` → `GET /manuscript`.
