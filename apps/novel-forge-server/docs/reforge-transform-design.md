# Reforge Transform Design

A **structural** re-authoring mode for source projects. The reforge pipeline (`reforge-pipeline-design.md`) elevates prose chapter-by-chapter and, by construction, cannot change what a novel _is_: its outline prompt is a faithful per-chapter transcription, its `chapter_reforges` upsert is keyed `(projectId, chapter)` so the mapping is strictly 1:1, no stage sees more than a 500-token tail of one neighbouring chapter, and the fidelity judge counts beat coverage and is forbidden from judging pacing. Removals ride the free-text `reforges.instructions` field with no ledger, so a subplot cut in chapter 40 resurfaces in chapter 90 with nothing to catch it. The only output is a markdown download; a reforged novel can never become a publishable project.

Transform mode exists for the case the 1:1 path structurally cannot serve: an existing long-form serialized web novel — hundreds to ~2,000 machine-translated chapters — where the problem is not the sentences but the **shape**. Filler arcs, repeated scene patterns, pacing stalls, subplots the original author abandoned. The goal is to **remove and condense what makes it bad while preserving what works**, and to land the result as a real, publishable project rather than a file.

The mechanism is a three-stage pipeline with a human gate in the middle: **analyse** the source into a persisted quality report, **plan** a source-span → output-chapter mapping the author approves, then **write** the output chapters under that plan with an append-only cut ledger keeping cut material cut. This doc drives tasks RT1–RT11 in CLAUDE.md and follows the conventions of `ai-system-design.md`; §2 lists its amendments.

The standard chapter-generation pipeline is **untouched by this document**, and so is the existing 1:1 reforge path — see §7.

## 1. Goals & decisions

1. **Structural authority is a plan, not a prompt.** A persisted, human-approved `reforge_plans` artifact maps every source chapter into exactly one span with an action (`keep` / `condense` / `merge` / `drop`) and a target output-chapter count. The write stage obeys it and may not invent, drop, or renumber an output chapter. Free-text instructions are demoted to voice and style preferences.
2. **See the whole novel before deciding anything.** A windowed analysis pass reads the entire source once, cheaply, and produces a human-readable quality report: filler spans, repetition clusters at the scene-pattern level, pacing stalls, dead subplots, and detected arc boundaries. Deterministic signals do everything they can before a model is asked.
3. **N:M output.** Output chapters are first-class rows with a `sourceSpan`, not a mirror of the source numbering. A 1,200-chapter source becoming a 400-chapter novel is the normal case, not an exception.
4. **Cut material stays cut.** Every removal — planned or discovered mid-write — lands in an append-only `reforge_cuts` ledger that is injected into the context of every subsequent output chapter, and the judge scans for resurfacing.
5. **Coverage is measured against the plan.** The transform judge measures kept beats from the plan, not beats from a faithful transcription of the source. Condensation is not drift; omitting a beat the plan marked _kept_ is.
6. **It ends in a project.** An approved, completed transform promotes into a new `new_novel` project whose chapters land exactly like a `final`-mode novel import: locked, human-authored, numbered from 1, publishable and extractable with no further editing.
7. **Zero regression risk to what exists.** Transform is a new mode behind a new column, new tables, and new endpoints. `chapter_reforges`, the chapter-reforge graph, and the reforge job's existing three phases are not modified.

Fixed decisions: transform is opt-in via `reforges.mode` (**not** inferred from `fidelity` — see §7); the plan is **always** human-gated, never auto-approved; `chapter_reforges` and `reforge_outputs` **coexist** (§5); promotion writes chapters directly through a helper shared with `runImport` rather than round-tripping a bundle (§8); the rename bible, recombine pass, and residue scan are reused from rebrand exactly as the 1:1 path reuses them.

## 2. Amendments to existing documents

- **New `ai-system-design.md` Appendix A hard rule 16:** _A transform write never invents structure. The approved plan's span → output-chapter mapping is the only authority for what exists, what is condensed, and what is cut; the writer may not add, drop, merge, or renumber an output chapter, and no write may run against an unapproved or superseded plan._
- **New Appendix A hard rule 17:** _Cut material stays cut. Every removal is recorded in the append-only cut ledger, the ledger is rendered into the context of every subsequent output chapter, and a resurfaced cut is a judge issue. Ledger entries are never deleted, only superseded by a new plan revision._
- **`reforge-pipeline-design.md` §1.3 — scoped, not replaced.** "The author declares, in `reforges.instructions`, what to cut" remains true in `chapter` mode. In `transform` mode, removals declared in `instructions` are **ignored**: the plan is the only removal lever, and the config endpoint rejects a transform-mode config whose instructions parse as removal directives only insofar as the UI warns — the server does not attempt to police prose. Documented, not enforced.
- **Appendix A rule 6 holds unchanged.** Each analysis window is its own `workflow_runs` row via `WorkflowRunService.runChain`, so context is still assembled once per run and persisted as a pack.
- **Appendix A rule 7 is not relaxed.** Rule 7 governs drafting from canon; reforge already feeds source prose to its own writer. The transform writer's source exposure is bounded to its own span (§9's window ceiling), never the novel.
- **Appendix A rule 8 holds unchanged.** Analysis output is never indexed, and analysis never retrieves through LlamaIndex — the repetition signal is n-gram, not embedding (§3.1).

## 3. Source analysis pass — RT2–RT4

One job stage over the whole source, producing a persisted report. Two tiers: deterministic signals first, model classification only for what signals cannot decide.

### 3.1 Deterministic pre-signals (`src/modules/reforge/analysis-signals.ts`, pure, no DI)

Cheap, exact, and reproducible — and they cut the model's job from "find the repetition" to "explain and rate this repetition".

- **Repetition clusters** — normalized 8-gram shingles per chapter (lowercased, punctuation-stripped, glossary-mapped names collapsed to their replacement so a rename does not hide a repeat). Building an inverted index over shingles whose corpus document-frequency lands in `[2, 50]` — frequent boilerplate and unique text both excluded — makes candidate-pair generation linear in corpus size instead of `O(n²)`; candidate pairs are then scored by Jaccard similarity and clustered at `>= 0.18`. This finds the "same tournament fight, tenth time" pattern that embeddings blur away.
- **Length outliers** — median absolute deviation over `chapters.wordCount`; runs of short chapters flag padding, isolated giants flag unsplit merges the recombine pass missed.
- **Static chapters** — no first-appearance of any glossary name and no new proper noun versus the running register, combined with a low dialogue-to-narration ratio: the classic recap/monologue stall.
- **Dropped threads** — first/last-mention map per glossary entry and per detected proper noun; an entity with `>= 8` mentions whose last mention is more than 40 chapters before the end is a dead-subplot candidate.
- **Arc-boundary candidates** — runs of chapters sharing a normalized title stem (`Tournament Round 3`, `Trial of the …`), plus cast-overlap discontinuities between adjacent chapter windows.

Signals produce **candidates with evidence**, never verdicts. `detectedBy: 'signal'` findings that the model never confirms stay in the report at low confidence and are visible to the author.

### 3.2 Windowed model pass

Window size is set by comparative-judgment quality, not by the context ceiling. The production writing/planning models carry 1M-token windows, so a 2,000-chapter novel (~5.4M tokens of prose) would still not fit, and the measured long-form degradation in `creative-writing-model-evaluation.md` means a 300k-token haystack would produce worse comparative judgments than five 60k ones. **15 source chapters per window** is the chosen unit:

| Component                                                      | Tokens |
| -------------------------------------------------------------- | ------ |
| 15 chapters × ~2,000 MTL words ≈ 2,700 tokens each             | ~40k   |
| Carry-forward state (story so far, open threads, arc register) | ~3k    |
| Signal digest scoped to the window                             | ~2k    |
| Context pack (world notes, glossary slice)                     | ~2k    |
| **Input per window**                                           | ~47k   |
| Output: 15 chapter cards + span findings + updated carry-state | ~4k    |

Windows run serially ascending because the carry-forward state is a chain; a window that fails records a `window_failed` finding and **continues** (flag-and-continue, per `job.executor.ts` precedent), but the stage throws at the end if more than 10% of windows failed — a plan drawn from a holed report is worse than no plan.

Per window the model emits, for each chapter, a **card** (~90 tokens: one-line what-happens, POV, cast, threads opened/advanced/closed, a `movement` rating of `advances`/`sidesteps`/`stalls`) and, for the window, findings that span chapters. Cards are persisted per chapter and are the substrate that makes **re-planning without re-analysing** possible.

### 3.3 Synthesis

One further pass over the card index (1,000 cards ≈ 90k tokens) plus the full signal digest, emitting the global view: arc boundaries, cross-window repetition clusters, dead subplots with their abandonment chapter, the pacing profile, and the report's prose summary. Above ~600 cards this runs two-level — per-100-card rollups, then a global pass over the rollups — to keep any single call under ~120k input tokens.

### 3.4 Persistence and surface

- `reforge_analyses` — one row per project (latest wins; older rows retained): `status`, `windowSize`, `chaptersAnalyzed`, `windowsFailed`, `signals` jsonb (the raw deterministic digest), `report` text (rendered markdown), `metrics` jsonb (`{repetitionRatio, stallRatio, medianWords, arcCount, deadThreadCount}` — the before-half of the RT11 evaluation), `runIds` jsonb.
- `reforge_chapter_cards` — unique `(analysisId, chapter)`: `card` jsonb, `movement`, `threadsOpened`/`threadsClosed` jsonb.
- `reforge_findings` — `analysisId`, `type` (`reforge_finding_type`: `filler`|`repetition`|`pacing_stall`|`dead_subplot`|`dropped_thread`|`arc_boundary`|`quality_outlier`|`window_failed`), `fromChapter`, `toChapter`, `severity` (1–5), `confidence` (0–1), `detectedBy` (`reforge_finding_source`: `signal`|`model`|`both`), `label`, `detail`, `evidence` jsonb.

`GET /reforge/analysis` returns the row plus finding counts; `GET /reforge/analysis/report` returns the rendered markdown so the author reads one document rather than a table of 400 findings.

### 3.5 Cost, per 1,000 source chapters

Assumptions: 2,000 words ≈ 2,700 tokens per MTL chapter; production routing per `defaults.ts` (planning `z-ai/glm-5.2` $0.97/$3.04 per M, writing `moonshotai/kimi-k3` $3/$15, review `anthropic/claude-sonnet-5` $2/$10); reasoning tokens estimated at 1× the visible output.

| Stage                                        | Calls | Input | Output | Cost     |
| -------------------------------------------- | ----- | ----- | ------ | -------- |
| Deterministic signals                        | 0     | —     | —      | $0       |
| Analysis windows (15 ch, planning group)     | 67    | 3.1M  | 0.54M  | ~$4.70   |
| Synthesis (rollups + global, planning group) | ~11   | 0.2M  | 0.05M  | ~$0.35   |
| Plan draft (§4, planning group)              | 1–4   | 0.4M  | 0.15M  | ~$0.85   |
| **Analyse + plan**                           |       |       |        | **~$6**  |
| Transform write + judge (§6)                 | ~420  | 6.7M  | 1.7M   | ~$50     |
| **Whole pipeline**                           |       |       |        | **~$56** |
| _(reference)_ today's 1:1 reforge, same book |       |       |        | _~$127_  |

Transform is **cheaper** than the 1:1 reforge of the same source, because the dominant cost is output tokens and it produces ~35% as many chapters. Analysis is ~10% of the total — it should never be the thing an author economizes on.

## 4. Transformation plan — RT5

The plan is a structured artifact, drafted by a model, edited and approved by a human, and thereafter the sole structural authority.

```ts
type SpanAction = 'keep' | 'condense' | 'merge' | 'drop';

interface PlanSpan {
  ordinal: number; // 1..K, contiguous, defines reading order
  spanKey: string; // stable across plan revisions; survives an edit that leaves from/to unchanged
  fromChapter: number; // inclusive source chapter
  toChapter: number; // inclusive source chapter
  action: SpanAction;
  targetChapters: number; // 0 for drop; === span length for keep; >= 1 otherwise
  arcLabel: string | null; // from the analysis' detected arc boundaries
  rationale: string; // why — quoted into the report and shown in the plan editor
  keptBeats: string[]; // the fidelity anchor for every output chapter this span produces
  cutThreads: string[]; // seeds the cut ledger at approval
  continuityNotes: string; // what must remain true across this span's seam
  findingIds: string[]; // provenance back into reforge_findings
}
```

**Invariants**, checked by a pure `validateTransformPlan(spans, sourceChapterCount)` before any draft is stored and again before approval:

- spans **partition** `1..N` — contiguous, no gaps, no overlaps. A source chapter is never silently forgotten; if it is going away, some span says `drop`.
- `keep` ⇒ `targetChapters === toChapter - fromChapter + 1`; `merge` ⇒ `targetChapters === 1`; `condense` ⇒ `1 <= targetChapters < span length`; `drop` ⇒ `targetChapters === 0`.
- output chapter numbers are **derived**, never authored — the running sum of `targetChapters` in ordinal order, exactly like novel-import's derived numbering (`novel-import-format.md` §5).
- a `drop` span may not be the first span (a novel needs an opening) and may not sit between two spans with no `continuityNotes` on the following span — the bridge is mandatory where the seam is.
- every `cutThreads` entry resolves to a ledger entry at approval.

**Lifecycle.** `reforge_plans.status`: `draft` → `pending` → `approved` → `superseded`. `POST /reforge/plan` drafts one from the analysis (job stage `plan`); `PUT /reforge/plan/spans` replaces the span set wholesale after validation and bumps `revision`; `POST /reforge/plan/approve` freezes it, seeds the cut ledger, generates the seam bridge directives (§6.2), and is the gate the transform stage checks (`REF_005`). Approval mirrors `POST /volumes/:volumeKey/arcs/approve`: an explicit, idempotent, human-only call.

Editing an approved plan creates a **new revision in `draft`** and marks the old one `superseded`; the old plan's outputs are retained but reported as stale. Spans whose `fromChapter`/`toChapter`/`action`/`targetChapters` are unchanged keep their `spanKey`, so their already-written outputs carry forward untouched — without this, a single edit at span 3 of 300 would invalidate a whole book's worth of generation.

## 5. N:M mapping — RT1, RT8

```ts
export const reforgeOutputs = pgTable(
  'reforge_outputs',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    planId: bigint('plan_id', { mode: 'bigint' })
      .notNull()
      .references(() => reforgePlans.id, { onDelete: 'cascade' }),
    outputChapter: integer('output_chapter').notNull(), // derived from the plan, 1..M
    spanOrdinal: integer('span_ordinal').notNull(),
    spanKey: varchar('span_key', { length: 64 }).notNull(),
    fromChapter: integer('from_chapter').notNull(), // inclusive source span
    toChapter: integer('to_chapter').notNull(),
    indexInSpan: integer('index_in_span').notNull(), // 0-based; which slice of a condensed span
    title: varchar('title', { length: 500 }),
    body: text('body').notNull(), // '' sentinel on failed rows, per chapter_reforges precedent
    summary: text('summary'),
    planBeats: jsonb('plan_beats'), // the kept beats this output owes — the judge's contract
    changes: jsonb('changes'),
    fidelity: jsonb('fidelity'),
    carryState: jsonb('carry_state'),
    cutDelta: jsonb('cut_delta'), // cuts this chapter discovered, appended to the ledger
    status: reforgeOutputStatus('status').notNull(), // written | attention | failed
    issues: jsonb('issues'),
    wordCount: integer('word_count'),
    runId: uuid('run_id'),
    revision: integer('revision').notNull().default(1),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [
    unique('reforge_outputs_plan_chapter_unique').on(t.planId, t.outputChapter),
    index('reforge_outputs_project_status_idx').on(t.projectId, t.status),
    index('reforge_outputs_plan_span_idx').on(t.planId, t.spanKey),
  ],
);
```

**Re-runs and repairs key on `(planId, outputChapter)`.** A single-output re-run re-reads its span from the plan, so it can never drift from the approved structure; a whole-plan re-run recomputes targets as "outputs of this plan not yet `written`/`attention`", with `failed` always retried — the same data-derived selection `selectRebrandChapters` uses today. Carrying `spanKey` alongside the ordinal is what makes a plan revision cheap: outputs whose `spanKey` still exists in the new plan with identical bounds are copied forward at the new `outputChapter`, everything downstream of the first genuinely-changed span is regenerated.

**`chapter_reforges` coexists; it is not migrated.** Migrating would mean fabricating a degenerate one-chapter span per row, a new plan per project that never had one, and a rewrite of the six shipped reforge endpoints, the reforge web panel, and the RF1–RF6 test suites — all to unify two tables that mean different things (a 1:1 re-author of chapter N versus an output chapter owing beats to a span). The cost of coexistence is one `switch (reforges.mode)` in `ReforgeService.status`/`renderManuscript` and a second reader route in the web panel. That is the cheaper and far less risky trade, and it is what makes goal 7 ("zero regression risk") true rather than aspirational.

## 6. Cut ledger, seam repair, and the plan-aware judge — RT6, RT7

### 6.1 The ledger

`reforge_cuts` — append-only, unique `(planId, cutKey)`:

```ts
interface CutEntry {
  cutKey: string; // slug; the merge key
  kind: 'subplot' | 'thread' | 'entity' | 'arc' | 'running_gag' | 'scene_pattern';
  label: string; // "the Azure Sect tribunal subplot"
  aliases: string[]; // deterministic resurfacing scan targets
  detail: string; // what it was, in one or two sentences
  disposition: 'cut' | 'condensed' | 'resolved_early';
  replacementNote: string | null; // "the power-up it granted is now earned in the duel of output ch. 74"
  originSpanOrdinal: number;
  firstSourceChapter: number;
  lastSourceChapter: number;
  effectiveFromOutput: number; // never resurfaces at or after this output chapter
}
```

Seeded at plan approval from every `drop` span and every `cutThreads` entry; grown during the transform by each output chapter's reported `cutDelta`, merged with the same **insert-conflict-keeps-existing** rule as `rebrand_glossary` — a cut is never re-described once recorded.

Rendered into the transform pack as two sections so the caching contract (`interactive-refinement-design.md` §10.2) survives a growing ledger:

- `cut_ledger` — **stable**: everything seeded at approval, byte-identical for the whole run.
- `discovered_cuts` — **volatile**: entries appended during the transform, plus a per-chapter relevance note.

Both are capped at ~1,500 tokens combined, ordered by (1) entries whose aliases actually appear in this span's source prose — the ones the writer is about to trip over — then (2) `effectiveFromOutput` descending. Truncation drops the least-at-risk entries first.

### 6.2 Seams

A seam is a boundary where the source no longer explains the output: after a `drop`, and at every internal boundary of a `condense`. Two mechanisms, both plan-stage responsibilities so the writer never improvises structure:

- **Bridge directives**, generated once at plan approval for every drop boundary and stored on the following span: what the reader last saw, how much time has passed, what must be true when this chapter opens, and which set-ups from the dropped span now have to be paid elsewhere (or explicitly abandoned).
- **Prev-tail continuity**, unchanged from the 1:1 path: a 500-token tail of the previous **output** body plus `carryState`. Never the source tail — it leaks pre-rename names and pre-cut material by definition.

### 6.3 The judge

`reforge-transform-judge` replaces `reforge-judge` for this mode. It receives `planBeats`, the span's `continuityNotes`, the relevant ledger slice, and the written prose, and reports exactly four issue classes:

- `missing_kept_beat` — a beat the plan marked kept did not land;
- `resurfaced_cut` — ledgered material reappeared (pre-scanned deterministically over `aliases` first; the model only adjudicates the hits and catches paraphrased resurfacing);
- `seam_break` — the chapter contradicts its bridge directive or its `continuityNotes`;
- `naming` / real-world residue — unchanged, from the shared rebrand scan.

It is still **forbidden** to critique prose quality, pacing, or word choice — same reasoning as `rebrand-audit` and `reforge-judge`: gating on taste causes repair thrash. **Condensation is explicitly not drift**: source beats absent from `planBeats` are outside the contract, and the judge is told so. This is the single most important behavioural change from the 1:1 judge, which would flag every intentional cut.

Routing is the shipped shape: clean → persist; dirty on attempt 0 → one repair pass through `write`; still dirty → persist as `attention`. `routeAfterTransformJudge` is exported and pure, named distinctly from both existing routers.

### 6.4 The span-transform graph (`src/modules/ai/graphs/span-transform.graph.ts`)

```
loadSpan → transformContext → write → residueScan → cutScan → judge ─┬→ persistOutput → mergeGlossary → appendCuts → finish
                                ↑ (dirty & attempt 0)                 │
                                └──────────── prepareRepair ──────────┘
```

There is **no outline node**. The plan's `keptBeats` are the outline, authored once at plan time and human-approved — which removes one model call per output chapter and, more importantly, removes the only place the 1:1 pipeline could silently re-introduce a beat the author cut.

`loadSpan` reads the span's source chapters (bounded by §9's ceiling), the approved plan span, the glossary, the ledger slice, and the previous output's `carryState` + tail. `WorkflowRunService.runSpanTransform({projectId, planId, outputChapter, jobId?})` wraps it per precedent.

## 7. Fidelity levels reconciled

- **`preserve` and `close`** run today's `chapter-reforge.graph.ts` against `chapter_reforges` with no change whatsoever. No new column is read on that path; no prompt version moves; no test changes.
- **Transform is gated on `reforges.mode`, not on `fidelity`.** The brief for this mode was "loose becomes the plan-driven transform", and overloading the existing enum is the obvious implementation — but it is the wrong one: projects already configured `fidelity: 'loose'` would be silently re-routed into a pipeline that refuses to run without an analysis and an approved plan, turning a working config into a 400. So: `reforges.mode` (`reforge_mode`: `chapter` | `transform`, default `chapter`) is the switch, and `transform` **requires and forces** `fidelity: 'loose'` — the config endpoint sets it and rejects any other value (`REF_008`). The end state the brief asked for is reached (loose ⇔ transform, going forward) without a silent behaviour change for existing rows.
- Within a span, `loose`'s existing within-chapter latitude is **subsumed** by the plan: `renderReforgeFidelityGuidance('loose')` is not used by the transform prompt, which carries its own condensation guidance scoped by the span's `targetChapters`.
- **The standard chapter-generation pipeline (brief → outline → generation → judge → drafts) is untouched.** Transform reads source chapters and writes `reforge_outputs`; it shares no table, prompt, or graph with generation.

## 8. Promotion path — RT9

An approved plan whose outputs are all `written`/`attention` promotes into a publishable project.

Two candidates were weighed:

1. **Reuse `novel-import` `final`-mode semantics via the bundle** — build a `NovelBundle` in memory and hand it to `NovelImportService.import`. It reuses a tested path and lands exactly the right chapter state, but it serializes an entire manuscript (a 400-chapter output at 3,500 words is ~12MB) into `jobs.payload` only to read it straight back out, runs untrusted-input validation over data we just generated, and adds a `ReforgeModule → NovelImportModule` edge.
2. **A dedicated promote endpoint writing chapters directly.**

**Decision: (2), reusing the landing semantics literally.** `runImport`'s chapter-landing block — batched inserts of 25, `status: 'done'`, `generator: 'human'`, `locked: true`, contiguous numbering from 1, `new_novel` kind, the `bible_documents` placeholder rows — is extracted into a pure-ish helper `landFinalChapters(tx, projectId, chapters)` in `src/modules/novel-import/`, called by both `runImport` and the new promote stage. Same semantics, one definition, no bundle round-trip, no payload blob; the reforge side imports the helper file directly and never the novel-import barrel, exactly as `chapter-reforge.graph.ts` imports `residue-scan` directly.

`POST /projects/:projectId/reforge/promote` body `{title?, seedVolumes?}` → 202, job stage `promote`. It creates a new `new_novel` project owned by the same principal with `sourceProjectId` pointing at the source project — the column already exists — copies title/synopsis/themes/cover, lands the outputs' bodies as chapters 1..M in output order (`failed` outputs block promotion; `attention` outputs are allowed and reported), and records the promoted project id on `reforge_plans.promotedProjectId` so the transform panel can link to it. Guarded by `REF_009` (no approved plan / incomplete outputs) and idempotent per plan revision.

**Bible and extraction.** The promoted project is an ordinary `new_novel` project with chapters, so the extract/consolidate pipeline runs on it with no relaxation — extraction is not project-kind gated, only recombine, rebrand, and reforge are. Bible documents land as the same contentless `<section>/default` placeholders `ProjectService.create` and `final`-mode import produce, and are then filled by extraction or by the chat hub, identically to any imported final novel. With `seedVolumes: true` the plan's detected `arcLabel` boundaries are written as `volumes` rows so the promoted project is immediately plannable — cheap, since the boundaries are already in the analysis, and the only thing a `final`-mode import genuinely cannot give you.

## 9. Schema, error codes, job stages, endpoints, UI, config — RT1, RT8, RT10

**New schema file** `src/database/schemas/reforge-transform.ts` (the shipped `reforge.ts` is not edited beyond the `mode` column):

| Table                   | Purpose                                               | Key constraint                                         |
| ----------------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| `reforge_analyses`      | one analysis run: report, metrics, signals            | `(projectId, createdAt)` index                         |
| `reforge_chapter_cards` | per-source-chapter digest — the re-planning substrate | unique `(analysisId, chapter)`                         |
| `reforge_findings`      | typed, evidenced quality findings                     | `(analysisId, type)` index                             |
| `reforge_plans`         | versioned plan header + approval + promoted project   | unique `(projectId, revision)`                         |
| `reforge_plan_spans`    | the span rows of §4                                   | unique `(planId, ordinal)`, unique `(planId, spanKey)` |
| `reforge_outputs`       | output chapters (§5)                                  | unique `(planId, outputChapter)`                       |
| `reforge_cuts`          | append-only cut ledger (§6.1)                         | unique `(planId, cutKey)`                              |

**Column addition:** `reforges.mode` (`reforge_mode`, default `'chapter'`). **New enums:** `reforge_mode`, `reforge_analysis_status`, `reforge_finding_type`, `reforge_finding_source`, `reforge_span_action`, `reforge_plan_status`, `reforge_output_status`, `reforge_cut_kind`, `reforge_cut_disposition`. Baseline migration regenerated with `bun scripts/db.ts apps/novel-forge-server generate`; template DB rebuilt with `create-template`.

**Error codes** (extending the existing `REF_` group in `src/classes/app-error-code.ts`):

| Code      | Kind | Meaning                                                                  |
| --------- | ---- | ------------------------------------------------------------------------ |
| `REF_004` | 404  | No analysis has been run for this project                                |
| `REF_005` | 400  | Transform requires an approved plan                                      |
| `REF_006` | 400  | Plan is invalid — spans must partition every source chapter exactly once |
| `REF_007` | 404  | Output chapter not found                                                 |
| `REF_008` | 400  | Transform mode requires `fidelity: 'loose'`                              |
| `REF_009` | 400  | Promotion requires an approved plan with no failed outputs               |
| `REF_010` | 409  | Plan was superseded by a newer revision                                  |

**Job stages.** No new `job_kind`: the `reforge` kind gains `payload.stage` (`analyze` | `plan` | `transform` | `promote`) with distinct targets (`reforge-analyze-{id}`, `reforge-plan-{id}`, `reforge-{id}`, `reforge-promote-{id}`), which coexist under the unique `(projectId, kind, target)` index while the per-project concurrency lock serializes them. A new enum value per stage would mean four `job_kind` migrations to buy nothing. Progress phases, derived from data as always, never from `reforges.status`:

- `analyze` → `recombining` → `signals` → `analyzing` (window i/N) → `synthesizing`
- `plan` → `planning`
- `transform` → `verifying` (plan approved, glossary seeded) → `glossary` → `transforming` (output i/M)
- `promote` → `promoting` (batched insert) → `seeding`

**Endpoints** (`src/modules/reforge/`, controller registered in `PipelineModule` as today):

- `PUT /projects/:projectId/reforge/config` — extended with `mode`; switching to `transform` forces `fidelity: 'loose'`.
- `POST /projects/:projectId/reforge/analyze` — 202, stage `analyze`.
- `GET /projects/:projectId/reforge/analysis` — row + finding counts + metrics (`REF_004`).
- `GET /projects/:projectId/reforge/analysis/report` — rendered markdown report.
- `GET /projects/:projectId/reforge/analysis/findings` — paged, filterable by `type`/`severity`.
- `POST /projects/:projectId/reforge/plan` — 202, stage `plan` (drafts from the latest analysis).
- `GET /projects/:projectId/reforge/plan` — header + spans + derived output numbering.
- `PUT /projects/:projectId/reforge/plan/spans` — replace span set; validates (`REF_006`), bumps revision.
- `POST /projects/:projectId/reforge/plan/approve` — freeze, seed ledger, generate bridge directives.
- `POST /projects/:projectId/reforge/transform` — 202, stage `transform`, payload `{outputs?: number[], force?, limit?}` (`REF_005`).
- `GET /projects/:projectId/reforge/outputs` / `…/outputs/:outputChapter` (`REF_007`) / `POST …/outputs/:outputChapter` re-run.
- `GET /projects/:projectId/reforge/cuts` — the ledger, for the author to audit what went away.
- `GET /projects/:projectId/reforge/manuscript` — mode-dispatched: `chapter_reforges` in chapter mode, `reforge_outputs` in transform mode.
- `POST /projects/:projectId/reforge/promote` — 202, stage `promote` (`REF_009`).

**Config.** `reforges.settings` grows `{analysisWindow?: number (default 15), targetCompression?: number (0.2–1.0, the plan drafter's global ratio hint), minSpanChapters?: number (default 1), maxSpanSourceChapters?: number (default 6 — the write-stage source ceiling), judgeEnabled?, targetWords?}`. `maxSpanSourceChapters` is a hard ceiling the plan validator enforces: it is what keeps rule 7's spirit intact and bounds the per-chapter input cost.

**Web (`novel-forge-web`).** A `transform` tab beside the existing reforge panel, only for source projects in transform mode: (1) **Analysis** — report markdown, a chapter heatmap coloured by `movement`, a filterable findings table; (2) **Plan** — span table with per-row action select, `targetChapters` stepper, rationale/continuity editors, a live derived output-count header and a validation banner that blocks Approve until the partition is clean; (3) **Transform** — progress + written/attention/failed chips, output list, source-span ↔ output reader with the span's source chapters on the left; (4) **Cuts** — the ledger; (5) **Promote** — button plus a link to the created project. `src/lib/apis/reforge-transform.api.ts` alongside the existing hand-written reforge API module.

## 10. Task breakdown

Ordered so each task leaves the tree green on its own.

- [x] **RT1** — Schema & error codes: `src/database/schemas/reforge-transform.ts` (7 tables), `reforges.mode` column, 9 enums, `REF_004`–`REF_010`, baseline migration regen, template DB rebuild, this doc cross-linked from CLAUDE.md. _Verify:_ migration applies to the template DB, schema tests green.
      `spanKey` carries a second unique constraint per plan — it is the carry-forward merge key, so a duplicate would silently mis-copy an output. `reforge_plan_spans.bridgeDirective` is materialized now rather than at RT6, since §6.2 stores it on the span.
- [x] **RT2** — Deterministic signals: `analysis-signals.ts` pure module — shingle inverted index + Jaccard clustering, MAD length outliers, static-chapter detection, first/last-mention map, title-stem runs. _Verify:_ unit matrix over synthetic corpora incl. a planted repeated arc and a planted dropped thread; a 2,000-chapter corpus completes under 30s.
      Shingles are mod-8 sampled before indexing: keeping all of them costs ~5.4M fingerprints on a 2,000-chapter corpus, and mod-p sampling estimates the same Jaccard from an eighth of the data. `computeAnalysisSignals` returns `staticRatio` (deterministic) rather than §3.4's `stallRatio` (model `movement`); RT4 folds the two into `reforge_analyses.metrics`. Entity-level abandonment is emitted as `dropped_thread` — only the model can promote a dropped thread to a `dead_subplot`. Thresholds the doc fixes at prose scale (`deadThreadGap`, `minMentions`, `minTitleRun`, shingle width, Jaccard floor) are options with those defaults, so the test matrix can plant a thread in a 40-chapter corpus.
- [x] **RT3** — Analysis prompts & context: `reforge-analyze-window` + `reforge-synthesize` (analytical, role `extraction`), class-schema outputs in `reforge-transform.schema.ts`, registry entries, render goldens, `ContextAssembler.forReforgeAnalysis` + `REFORGE_ANALYSIS_BUDGET`. _Verify:_ prompt suite green; stable segment byte-identical across windows.
      One `forReforgeAnalysis` serves both passes — the window's source prose and the synthesis card index travel as template vars, so the pack is the rename bible (stable) plus the scoped signal digest and carry state (volatile). The two-level synthesis of §3.3 runs the one `reforge-synthesize` prompt over card slices and then over its own rollups, told which it is doing by a `scope` var. Signals carry an `id` and `renderSignalDigest(signals, from?, to?)` renders the scoped digest, so a model finding cites the detector it confirms in `signalRef` and `detectedBy` can be resolved to `both`.
- [x] **RT4** — Analysis stage: `runReforge` gains `payload.stage`, `analyze` implemented (signals → serial windows via `runChain` with carry-forward → synthesis → persist cards/findings/report), 10%-failed-window abort, report renderer, analysis endpoints + DTOs. _Verify:_ mocked-model executor test over a 40-chapter fixture incl. a mid-run window failure.
      The stage runs recombine and then the analysis; it does **not** seed the rename bible, because analysis reads shape, not names — an unseeded project analyses fine and the pack says so. `ReforgeModule` now imports `AiModule` (as `RebrandModule` does) for `ReforgeAnalysisService`; the graph stays acyclic because neither Ai nor Rebrand imports Reforge. `reforges.settings.analysisWindow` is live. Note the 10% rule bites hard on short sources: a 40-chapter project at the default window is 3 windows, so one failure aborts — which is the intended reading of "a plan drawn from a holed report is worse than no plan", but it makes the §14 smoke run all-or-nothing.
- [x] **RT5** — Plan: `reforge-plan` prompt (role `plan`) + schema, pure `validateTransformPlan`, plan draft/edit/approve service, `spanKey` carry-forward across revisions, plan endpoints. _Verify:_ validator matrix (gaps, overlaps, bad targets, drop-first, missing bridge) + revision carry-forward test.
      `spanKey` is **derived**, not authored: `spanKeyFor` hashes `fromChapter:toChapter:action:targetChapters`, so §4's "spans whose bounds, action, and target are unchanged keep their key" holds by construction rather than by the model's discipline. `maxSpanSourceChapters` is enforced as `ceil(spanLength / targetChapters)`, which is what actually bounds one output chapter's source exposure. Every span edit writes a **new revision** and supersedes the old, draft or approved alike, so an output always names the exact revision it was written under; `PUT /plan/spans` and `POST /plan/approve` take an optional `baseRevision` and 409 (`REF_010`) on a mismatch. Approval currently freezes and re-validates only — the ledger seeding and bridge-directive generation §4 lists are RT6's, wired at the same call site.
- [x] **RT6** — Cut ledger & transform context: `reforge_cuts` service with ledger seeding at approval, bridge-directive generation, `forReforgeTransform` pack with stable `cut_ledger` / volatile `discovered_cuts`, relevance ordering + truncation, `REFORGE_TRANSFORM_BUDGET`. _Verify:_ ledger merge idempotence; truncation keeps at-risk entries; stable segment byte-identical while no cut is appended.
      **Bridge directives are composed deterministically, not generated.** Everything §6.2 asks a directive to say — what the reader last saw, what the dropped span took with it, what must be true when the chapter opens — is already authored in the plan the human approved, so `renderBridgeDirective` assembles it from the dropped span's `arcLabel`/`rationale`/`cutThreads` and the following span's `continuityNotes`. A model call there would paraphrase approved text with a chance of contradicting it, against the house rule to prefer deterministic service code. `effectiveFromOutput` is the first output chapter written at or after the cut (a trailing drop lands one past the end, so nothing can resurface it), and the pack also carries the span's plan contract as a volatile `plan_span` section plus its `bridge`.
- [ ] **RT7** — Span-transform graph: `reforge-transform-write` + `reforge-transform-judge` prompts & schemas, deterministic resurfaced-cut pre-scan, `span-transform.graph.ts`, exported pure `routeAfterTransformJudge`, `runSpanTransform`. _Verify:_ route matrix + mocked-router graph runs; a planted resurfaced cut is caught by the pre-scan alone.
- [ ] **RT8** — Transform stage & endpoints: `transform` stage (plan/glossary verification, data-derived output selection, flag-and-continue), output/cut/manuscript endpoints, mode dispatch in `ReforgeService.status`/`renderManuscript`. _Verify:_ executor + controller e2e; a `chapter`-mode project's existing endpoints byte-identical to pre-RT1 responses.
- [ ] **RT9** — Promotion: `landFinalChapters` extracted from `runImport` and shared, `promote` stage + endpoint, `sourceProjectId` link, `promotedProjectId`, optional volume seeding from arc boundaries. _Verify:_ promote → `POST /publish` → chapter publish round-trip green; `runImport` tests unchanged.
- [ ] **RT10** — Web UI: analysis/plan/transform/cuts/promote tabs per §9. _Verify:_ web type-check + lint + build green; api-types regenerated per the monorepo's non-atomic-contract rule.
- [ ] **RT11** — Evaluation: run the full pipeline over a known-flawed sample (a ~300-chapter MTL cultivation serial with a documented filler arc), and record in this doc: chapter-count reduction, `repetitionRatio` and `stallRatio` before vs. after (the same shingle statistic, re-run over the promoted project's chapters), median chapter length, dead-thread count, judge issue rates, and a human read-through of 10 sampled seams. _Verify:_ the after-metrics improve on repetition and stall ratio without a rise in `seam_break` issues above 5% of outputs; results appended as §12.

## 11. What NOT to build

The shape of this problem invites over-engineering. Explicitly out of scope:

- **No full-novel context dump.** Not even on 1M-token models. The window ceiling (§3.2) and `maxSpanSourceChapters` (§9) are load-bearing, not provisional; a 300k-token haystack degrades exactly the comparative judgment the analysis exists to make.
- **No per-character agents, no multi-agent plan debate, no critic/author loops.** One drafter, one human, one judge — same discipline the rest of the AI subsystem keeps.
- **No auto-approved plans.** The plan is the moment a human decides what their novel is. A "just run it end to end" button is the one feature that would make this mode untrustworthy.
- **No prose-quality gate.** The judge measures the plan contract, not taste. This is settled precedent (`rebrand-audit`, `reforge-judge`) and re-litigating it produces repair thrash.
- **No cross-span reordering.** Spans are contiguous and ordered. Global reordering breaks the ledger's `effectiveFromOutput` semantics, the carry-state chain, and any hope of a reviewable plan.
- **No embedding retrieval over source prose for analysis.** N-grams find verbatim and near-verbatim repetition, which is the actual failure mode of serialized MTL; embeddings blur it. And source prose stays out of the index (rule 8).
- **No second glossary, no second recombine, no second residue scanner.** All three are reused from rebrand exactly as the 1:1 path reuses them.
- **No changes to `chapter_reforges`, the chapter-reforge graph, its prompts, or chapter-generation.** Coexistence is the design (§5).
- **No live re-planning mid-transform**, no branching/A-B plans, no automatic promotion on completion, and no partial promotion of a subset of outputs.
- **No new `AiRole`.** Analysis reuses `extraction`, planning reuses `plan`, writing reuses `reforge`, judging reuses `judge` — no profile churn in either `AI_PROFILE`.

## 12. Open questions

1. **Plan reviewability at 2,000 chapters.** A 2,000-chapter source yields roughly 400–700 spans; nobody reviews that table honestly. The likely answer is arc-level rollup approval (approve an arc, its spans inherit) with drill-down only where the author cares — but that is a second gate and a second invariant, and it is deliberately not designed here.
2. **Who owns `targetChapters`** — the model per span, or a global `targetCompression` the author sets with the model distributing it? The current design lets the model author it with the ratio as a hint; whether authors actually want the finer control is unmeasured.
3. **Reordering within an arc** is forbidden (§11). Some pacing fixes genuinely want it. Whether an arc-scoped reorder is worth the ledger and carry-state complexity is unresolved.
4. **Ledger growth.** At ~2,000 source chapters a plan can seed 100+ cuts; the 1,500-token cap starts truncating. An aging or rollup policy ("everything cut before output ch. 200 collapses into one summary entry") is probably needed and is not designed.
5. **Provenance in the promoted project.** Whether the analysis report, plan, and ledger should be copied into the promoted project (as a bible document? a project note?) or left behind a `sourceProjectId` hop.
6. **Cut characters whose voice was load-bearing.** The ledger records that a character is gone, not that their function — the comic relief, the exposition delivery — has to be reassigned. Whether that belongs in `replacementNote` or wants its own plan field is open.

## 13. Risks

- **The plan is only as good as the analysis.** A dead subplot the analysis missed becomes a kept span nobody questioned. Mitigated by deterministic signals surfacing unconfirmed candidates at low confidence rather than discarding them, and by the plan editor showing `findingIds` provenance per span.
- **Condensation quality is unmeasured by the gate.** The judge checks that kept beats landed and cuts stayed cut; it cannot tell whether a 6-chapter span condensed into 2 chapters _reads_ well. This is a deliberate accepted gap — the alternative is a taste gate. RT11's human read-through of seams is the compensating control.
- **Cost concentration.** The transform stage is ~90% of spend and runs after the human gate, so a bad approval is expensive. `limit` on the transform payload enables a 10-output trial before committing the book.
- **Plan revision churn.** An author who edits span 3 of 300 after 200 outputs are written keeps only spans 1–2 unchanged unless `spanKey` carry-forward works exactly as specified. This is the single highest-value thing for RT5's tests to nail down.
- **Two manuscript shapes.** Mode dispatch in `renderManuscript`/`status` is a small seam that will be forgotten by the next feature that touches reforge. Cheap insurance: one test per mode asserting the shipped chapter-mode response is byte-identical to its pre-transform golden.

## 14. Verification

Per task: `bun scripts/verify.ts apps/novel-forge-server`; web tasks additionally type-check + lint + build, with `api-types.gen.ts` regenerated in the same change. Mocked-model suites cover the analysis executor, the span-transform graph, and the promote stage end-to-end; the pure modules (`analysis-signals`, `validateTransformPlan`, `routeAfterTransformJudge`, the resurfaced-cut pre-scan) carry matrices rather than snapshots. Live smoke: a 40-chapter source project → `PUT config {mode: 'transform'}` → `POST analyze` → read the report → `POST plan` → edit two spans → `approve` → `POST transform {limit: 5}` → inspect `reforge_outputs`, `reforge_cuts`, `model_calls` → `POST promote` → publish chapter 1 of the promoted project.
