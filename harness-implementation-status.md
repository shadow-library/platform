# Harness Implementation Status

Source spec: `harness-final-recommendation.md`, Section 10 (P0 Implementation Plan) and Section 11
(P1 Plan). P0 is complete and merged; P1 is broken down below per §14's evaluation-first ordering.

## Summary — P0

- Completed: 9
- In Progress: 0
- Pending: 0
- Blocked: 0

All nine P0 items from `harness-final-recommendation.md` §10 are complete. Per §14, evaluation
tooling (Track 2 deterministic metrics + Track 3 process invariants) is being built as reusable
scripts; Track 1 (blind human paired comparison) is out of scope for automated execution and
requires a human rater when a real generation pass is run. P1 tasks are broken down below so work
can start once eval tooling lands, but — per §14 and §15 — a P0-vs-candidate run through Track 1–3
should still happen before P1 changes ship to confirm no regression.

## Summary — P1

- Completed: 3
- In Progress: 0
- Pending: 12
- Blocked: 0

## P1 Tasks

Source: `harness-final-recommendation.md` §11 (7 top-level items), decomposed into reviewable units
matching P0's granularity. Each is small enough to implement/review/commit/merge independently, per
the same one-task-at-a-time worktree workflow used for P0.

| ID    | Priority | Task                                                                                                                                | Status    | Dependencies                                |
| ----- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------- |
| P1-01 | P1       | Bible-builder characters stage emits full entity `body` + initial `canon_facts` with `terms[]`                                      | COMPLETED | —                                           |
| P1-02 | P1       | Bible-builder world/power stage emits structured `world_facts`                                                                      | COMPLETED | —                                           |
| P1-03 | P1       | Add `bible_doc:`/`fact:` ref prefixes to `ContextAssembler.resolveRefs`                                                             | COMPLETED | P1-01, P1-02                                |
| P1-04 | P1       | Volume planner (`plan()`) reads relevant bible documents, behind a rebuild flag                                                     | PENDING   | P1-01, P1-02, P1-03                         |
| P1-05 | P1       | Extend `ContinuitySchema` with `characterStates`/`knowledgeChanges` fields                                                          | PENDING   | —                                           |
| P1-06 | P1       | New `character_states` table (schema + migration)                                                                                   | PENDING   | —                                           |
| P1-07 | P1       | Finalization applies ALL extracted continuity fields transactionally; fixes `continuityApplied` dead-end (D7)                       | PENDING   | P1-05, P1-06                                |
| P1-08 | P1       | Retire source-extraction overlap; drop or explicitly mark unused `timeline_events`/`power_progressions`                             | PENDING   | P1-07                                       |
| P1-09 | P1       | Route `outlineArc` through `forOutline()`; deprecate/cap whole-book `outline()`                                                     | PENDING   | —                                           |
| P1-10 | P1       | Reconciliation trigger every k finalized chapters (default 5, configurable) or on staleness                                         | PENDING   | P1-09                                       |
| P1-11 | P1       | Volume-completion epitome write (or explicitly drop the `volumes.epitome` column)                                                   | PENDING   | —                                           |
| P1-12 | P1       | Outliner authors `knowledgeContract`; persist `pov`; wire mystery `truthFactKey`                                                    | PENDING   | —                                           |
| P1-13 | P1       | Prompt-cache the generation path: `asStable` sections, `cacheStrategy`, fix rebrand/reforge stable-var bug                          | PENDING   | —                                           |
| P1-14 | P1       | Deterministic draft checks as a graph node before `judge` (word bounds, duplicated paragraphs, n-grams, cliché counts, tag density) | PENDING   | — (may reuse eval Track 2 metric functions) |
| P1-15 | P1       | Judge gains a brief-fulfillment category (D33's accepted half)                                                                      | PENDING   | —                                           |

### P1-01 — Bible-builder characters stage: full entity `body` + initial `canon_facts`

- Affected area: bible-builder characters-stage prompt + graph node, `entities`/`canon_facts` schemas.
- Acceptance criteria:
  - Characters stage writes full entity `body` (not just shallow rows) so entity cards stop being
    starved for pure-AI-built projects (manual edits/plan-import already write `body` — this closes
    the gap for the main AI-planned flow).
  - Emits initial `canon_facts` rows, including hidden truths, with `terms[]` populated so the
    deterministic knowledge leak scanner can see them.
  - Behind a rebuild flag — existing projects are unaffected until they opt in.
- What changed: `BibleStageEntity` (`new-novel.schema.ts`) gained an optional `body` field (full
  entity card — voice, motivations, relationships, backstory beats — sitting alongside, not
  replacing, the existing shorter `notes`, confirmed `body ?? notes` is the established fallback
  pattern already used in `context-assembler.service.ts`/`catalog.service.ts`/etc.). Added a new
  `BibleStageFact` class mirroring plan-import's `PlanBundleFact` shape (`factKey`, `text`,
  `subjects?`, `constraintNote?`, `terms?`, `revealChapter?`) and a `facts?: BibleStageFact[]` field
  on `BibleStageSchema`. The characters prompt (`characters.prompt.ts`, bumped `1.1.0` → `1.2.0`)
  now instructs the model to emit both, including hidden truths with `terms[]` for the leak scanner.
  `bible-builder.graph.ts`'s existing raw entity upsert gained `body: COALESCE(EXCLUDED.body,
entities.body)` (same pattern as `name`/`notes`, so a forced rebuild that omits `body` for an
  entity never wipes a previously-persisted card, but a rebuild that does supply fresh content still
  overwrites it — verified by dedicated tests for both directions); a new, parallel raw upsert block
  persists `facts` into `canon_facts` with the same per-field COALESCE semantics. No new "rebuild
  flag" was built — the existing `force`-gated stage-skip in `runStage()` already scopes this
  correctly (new projects always run the stage; existing projects only get the new fields on an
  explicit rebuild). `FactService` was deliberately NOT injected — its `upsert()` does a
  read-then-merge-then-write that doesn't fit a tight loop, and injecting it would require threading
  a new constructor param through `WorkflowRunService`'s `graphServices` getter (used by 7 other
  `as XServices` casts) for what a straightforward raw upsert already handles consistently with the
  existing `entities` upsert in the same function.
- Tests: `tests/ai/prompts.spec.ts` (schema round-trip for `body`/`facts`), `tests/ai/bible-builder-
graph.spec.ts` (new — entity `body` persists; forced rebuild preserves `body` on omission; forced
  rebuild overwrites `body` when supplied; `canon_facts` upsert with `terms[]` persists and is
  retrievable; the existing `force`-gated skip still works, writing nothing on a repeat non-force
  run).
- Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all
  green (629 pass, 10 skip, 0 fail). Confirmed `BibleStage*` never reaches an HTTP controller (grep
  of `api-types.gen.ts` returns zero matches), so no api-types regeneration was needed.
- Commit: 6e5f58a1

### P1-02 — Bible-builder world/power stage: structured `world_facts`

- Affected area: bible-builder world/power-stage prompt + graph node, `world_facts` schema.
- Acceptance criteria:
  - World/power stage emits structured `world_facts` categories (not just prose), consistent with
    what `context-assembler.service.ts` already knows how to render.
  - Behind the same rebuild flag as P1-01.
- What changed: `world_facts` was fully wired for reads (context assembly's `resolveRefs`,
  `forValidationWindow`, `forRebrandSeed` all already render it as `category/key: value`), but
  nothing wrote it — confirmed zero `worldFacts` writes anywhere in `bible-builder.graph.ts` before
  this task. Added `BibleStageWorldFact` (`category`, `key`, `value`, `chapter?` — mirroring
  `world_facts`'s columns and `BibleStageFact.revealChapter`'s optional-Integer pattern from P1-01)
  and a `worldFacts?: BibleStageWorldFact[]` field on `BibleStageSchema`. The world-power prompt
  (bumped `1.1.0` → `1.2.0`) now instructs the model to extract structured, lookup-ready facts
  (suggested categories `geography`/`power_system`/`technology`/`politics`, explicitly framed as
  examples, not an enforced enum — `category`/`key` are free-form varchar in the schema) alongside
  the prose it already writes. `runStage()` gained a parallel upsert block for `result.worldFacts`
  into `schema.worldFacts`, targeting the existing `(projectId, category, key)` unique constraint
  with the same per-field COALESCE-on-omit semantics used for `canon_facts` in P1-01 — a forced
  rebuild that omits a fact doesn't null it out, but does overwrite when fresh content is supplied.
- Tests: `tests/ai/bible-builder-graph.spec.ts` — new `world-power stage persistence` describe
  block (separate template-DB instance): initial persistence (value + chapter round-trip); COALESCE
  preserves a fact on a forced rebuild that omits it; overwrite on a forced rebuild that supplies a
  fresh value for the same `(category, key)`; the existing `force`-gated skip still applies (no
  world-fact writes on a repeat non-force run).
- Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all
  green (633 pass, 10 skip, 0 fail). Confirmed `worldFacts`/`BibleStageWorldFact` never reach any
  controller/DTO or `novel-forge-web`, so no api-types regeneration was needed.
- Commit: 6f0e9da8

### P1-03 — `bible_doc:`/`fact:` ref prefixes

- Affected area: `src/modules/ai/context/context-assembler.service.ts` (`resolveRefs`, currently six
  prefixes only).
- Acceptance criteria:
  - Two new resolvable ref prefixes, `bible_doc:` and `fact:`, so canon written by P1-01/02 is
    retrievable by the writer — today the bible is reachable only through lore embeddings the
    drafting path never queries.
  - Unknown/malformed refs of these prefixes fail closed into `unresolvedRefs`, consistent with
    existing prefix handling.
- What changed: `resolveRefs` gained `bible_doc:section/slug` (compound-key lookup against
  `bible_documents`' `(projectId, section, slug)` unique constraint — batched query filters on the
  unique sections/slugs requested, final correctness comes from the exact `${section}/${slug}`
  lookup map key, not the batched filter; rendered as the doc body truncated to 8,000 tokens via
  `truncateAtParagraph`, matching the existing full-document cap already used for `current_draft`)
  and `fact:factKey` (`canon_facts.text` + optional `constraintNote`, matching the existing
  `thread`/`mystery` lookup pattern). Both fail closed into `unresolved` on a miss, matching the
  existing six prefixes exactly.
  - **Safety boundary (deliberate, documented in code):** `fact:` is NOT wired into
    `catalog.service.ts`. `canon_facts` carries hidden-truth rows (per the character-knowledge
    design and P1-01's characters-stage work) that must stay POV-filtered until ledgered per
    chapter — `resolveRefs` is purpose-agnostic and has no chapter/POV context to check that, so a
    naive catalog listing would let the automated outliner spontaneously request a not-yet-revealed
    secret's ref and leak it straight into a future chapter's context, bypassing the entire CK3/CK4
    POV-filtered knowledge system. Keeping `fact:` refs reachable only through hand-authored paths
    (plan-import, manual brief edits, hand-authored chat-hub lookups) means only a human — who
    already carries editorial responsibility for not self-spoiling — can populate one. No
    per-chapter hiddenness filtering was built into `resolveRefs` itself; that would require
    threading chapter/POV context into a function used by five-plus different callers, which is out
    of this task's scope (mystery `truthFactKey` wiring is P1-12, a separate future task).
- Tests: `tests/ai/context-assembler.spec.ts` — new `resolveRefs — bible_doc and fact prefixes`
  describe block: resolves on hit, unresolved on miss for both prefixes, and a mixed-refs regression
  test confirming the two new cases don't cross-contaminate the existing six.
- Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all
  green (638 pass, 10 skip, 0 fail). Confirmed `catalog.service.ts` has zero diff (the safety
  boundary above is intact) and no `api-types.gen.ts` references this change.
- Commit: 449d919d

### P1-04 — Volume planner reads bible documents

- Affected area: `plan.prompt.ts`, `generation.service.ts`'s `plan()`.
- Acceptance criteria:
  - `plan()` currently reads only `project.brief` + skeleton fields; it now also receives the
    relevant bible documents the builder writes (structured canon from P1-01/02, resolved via
    P1-03), so the planner is no longer blind to the bible it cost tokens to build.
  - Does not change the volume/arc contract shape — content input only.

### P1-05 — Extend `ContinuitySchema`

- Affected area: `src/modules/ai/schemas/continuity.schema.ts` (or wherever the schema lives).
- Acceptance criteria:
  - Adds `characterStates: Array<{ entityKey, location?, conditions?, immediateGoal?, statusNote?, evidence }>`
    and `knowledgeChanges: Array<{ entityKey, factKey, how }>` per §6 of the recommendation doc.
  - `relationships` is already extracted today — no schema change needed there, only application
    (P1-07).
  - Prompt instructs "extract only what the prose establishes, with an evidence excerpt; empty
    arrays are correct."

### P1-06 — New `character_states` table

- Affected area: `src/database/schemas/*.ts`, migration.
- Acceptance criteria:
  - New table per §6: `projectId`, `entityKey`, `location`, `conditions: string[]`, `immediateGoal`,
    `statusNote` (one line, replaced not appended each update), `lastUpdatedChapter`.
  - Additive migration only.

### P1-07 — Finalization applies all extracted continuity fields transactionally

- Affected area: `chapter-finalization.graph.ts`, `generation.service.ts`'s manual-apply path.
- Acceptance criteria:
  - One extraction call at finalization; ALL fields applied transactionally: entity appearances, new
    entities, thread/mystery upserts (existing), `character_states` rows (P1-06), `entity_relationships`
    rows (already extracted, now applied), knowledge changes → `character_knowledge`, chapter
    summary/index updates (existing).
  - Fixes the D7 bug: `chapters.continuityApplied` is set on the graph-finalized path too — the
    manual-apply endpoint's `pending`-only guard (`generation.service.ts:872–876`) currently leaves
    graph-finalized chapters permanently stuck at `continuityApplied = false` with no recovery.
  - Low-confidence extractor rows route through the existing proposal-review flow instead of
    auto-applying.
  - Not persisted: timeline events, power progression, emotion/trust scores, before/after diffs,
    repetition signatures (explicitly rejected in the recommendation doc).

### P1-08 — Retire dead extraction paths

- Affected area: `entity_relationships` writer wiring, `timeline_events`/`power_progressions` tables.
- Acceptance criteria:
  - The separate source-extraction graph (currently unreachable — its consolidation service's
    upstream writer is never injected) is retired or repointed now that P1-07 covers relationship
    application through the mainline finalization path.
  - `timeline_events`/`power_progressions` (zero writers, grep-verified) are dropped with this P1
    migration, or left with an explicit "unused" note if a live project turns out to depend on them
    — do not wire them speculatively per the recommendation doc's explicit rejection.

### P1-09 — Route `outlineArc` through `forOutline()`

- Affected area: `generation.service.ts` (`outline()`/`outlineArc()` — already touched by P0-09,
  now extended), `refine.service.ts` (`forOutline` currently dead outside preview/tests).
- Acceptance criteria:
  - `outlineArc` becomes the production outline path, routed through the already-complete
    `forOutline()` pack (recent summaries + retrieval + catalog).
  - Whole-book `outline()` is deprecated or capped — briefs exist only for the current arc; anything
    beyond the next reconciliation point stays uncommitted, per the recommendation doc's planning
    hierarchy (§4.B).
  - Caveat inherited from the recommendation doc: `volumes.epitome` is never written (P1-11), so this
    task buys recent summaries + retrieval, not volume memory, until P1-11 lands.

### P1-10 — Reconciliation trigger

- Affected area: finalization graph / a new trigger hook, config.
- Acceptance criteria:
  - After every k finalized chapters (default 5) or on refinement staleness, remaining chapters of
    the _current_ arc are re-outlined (not the whole book).
  - Cadence is a config knob, not a hardcoded constant — the recommendation doc calls the default a
    guess to be tuned against usage.
  - Gated on hand-edit markers so a human's manual brief edits aren't silently clobbered by
    reconciliation.

### P1-11 — Volume-completion epitome write

- Affected area: bible/volume-completion hook, `volumes.epitome` column (exists, unused).
- Acceptance criteria:
  - Either: an epitome gets written when a volume completes, so `forOutline`'s existing epitome
    support (currently inert) starts doing something — OR — the column is consciously dropped with
    a documented decision, per the recommendation doc's explicit either/or framing. Pick one and
    justify it in the commit/status entry; don't leave it half-done.

### P1-12 — Outliner authors `knowledgeContract`

- Affected area: `outline.schema.ts` (`ChapterBriefSchema`), `outline.prompt.ts`, mystery schema.
- Acceptance criteria:
  - `ChapterBriefSchema` gains a `knowledgeContract` field, catalog-driven fact keys, authored by the
    outliner — this is the single gap keeping the epistemic ledger (canon_facts + character_knowledge)
    dormant for AI-planned projects; only manual edits/plan-import currently arm it.
  - `pov` is persisted instead of dropped at brief-body flattening (currently emitted by the model,
    dropped at persist per `docs/plan-import-design.md:120`'s own acknowledgment).
  - Mystery `truthFactKey` wired: a mystery's truth is a `canon_facts` row key, never duplicated
    prose — one epistemic authority, matching the recommendation doc's correction to the original
    report (hiddenness is derived per-chapter, not a `source` column).

### P1-13 — Prompt caching for generation

- Affected area: `context-assembler.service.ts` (`forChapter` stable/volatile split — machinery
  already exists via `asStable`/`segment`), `generation.prompt.ts` (`cacheStrategy`), rebrand/reforge
  `cacheStrategy` usage.
- Acceptance criteria:
  - Genuinely stable `forChapter` sections (style, volume objective, arc objective, resolved static
    canon refs) marked `asStable`; `generation.prompt.ts` declares a `cacheStrategy`.
  - Stable/volatile passed as separate template vars, following the pattern `chat.service.ts:280`
    already uses — not the currently-joined blob.
  - Fixes the existing rebrand/reforge bug: their `cacheStrategy` passes the _joined_ stable+volatile
    blob as "stable", so per-chapter churn defeats the cache it declares — this task corrects that
    alongside adding caching to generation itself.
  - Cost lever, not quality lever — measure via existing telemetry (`model_calls` cost/latency)
    rather than a new dashboard.

### P1-14 — Deterministic draft checks

- Affected area: new pure module + new graph node in `chapter-generation.graph.ts`, before `judge`.
- Acceptance criteria:
  - Word-count-out-of-bounds, duplicated paragraphs, repeated 5–8-grams vs. the last ~10 chapters,
    cliché-phrase counts over a threshold, dialogue-tag-density outliers — all deterministic, no LLM
    call.
  - Hard bounds feed the existing patch ladder as findings; soft thresholds are logged and surfaced
    at review, not auto-blocking.
  - Consider reusing the metric-computation functions built for the §14 Track 2 evaluation script
    (`tests/eval/deterministic-metrics.ts` or wherever it lands) rather than re-implementing n-gram/
    cliché-counting logic a second time — check for that overlap before writing new code.

### P1-15 — Judge brief-fulfillment category

- Affected area: `judge.schema.ts`, `judge.prompt.ts`.
- Acceptance criteria:
  - Judge gains a brief-fulfillment verdict category, now that briefs are validated artifacts
    (P0-09's coverage/uniqueness/chaining enforcement landed) rather than trusted-but-unverified
    model output.
  - Keeps the 4-anchored-category design (canon, ending, knowledge, now brief-fulfillment) — no
    9-dimension evaluator, per the recommendation doc's explicit rejection of that report proposal.

## Tasks

| ID    | Priority | Task                                                                                                          | Status    | Dependencies | Commit   |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------- | --------- | ------------ | -------- |
| P0-01 | P0       | Fail-closed judging + judge few-shot parity                                                                   | COMPLETED | —            | e9cee48e |
| P0-02 | P0       | Novel-validation coverage + scoped `needsRevalidation` updates                                                | COMPLETED | —            | 8acad8ce |
| P0-03 | P0       | Repair-ladder accounting (patch attempt budget + `sameFinding` tightening)                                    | COMPLETED | —            | 0beb8aa8 |
| P0-04 | P0       | Generation gates: reject stale briefs, error on briefless fallback                                            | COMPLETED | —            | 3415ff30 |
| P0-05 | P0       | Batch adjacency: draft-tail fallback for N+1, halt batch on non-clean outcome                                 | COMPLETED | —            | 523abe4f |
| P0-06 | P0       | Style/ending-contract constants: replace `DEFAULT_WRITING_INSTRUCTIONS`, widen `HookType`, single word target | COMPLETED | —            | df2c0bb0 |
| P0-07 | P0       | Chapter-context correctness: add arc section, drop duplicated brief, record budget evictions                  | COMPLETED | —            | be404dd8 |
| P0-08 | P0       | Extract-job payload mismatch fix (resolve chapter numbers server-side at enqueue)                             | COMPLETED | —            | 088c0022 |
| P0-09 | P0       | Outline invariant enforcement (coverage/uniqueness/chaining via factory closure + catalog ref check)          | COMPLETED | —            | 7fb3c080 |

## Completed

### P0-01 — Fail-closed judging (+ few-shot parity)

- What changed: added `evaluation_failed` to the `judge_verdict` pg enum (+ migration); both the
  in-graph judge (`chapter-generation.graph.ts`) and the standalone `judgeDraft`
  (`generation.service.ts`) now retry a parse-failed judge call once, and on a second failure
  resolve to verdict `evaluation_failed` with a synthetic `judge output unparseable` finding and
  route to human review (`reviewStatus: 'contradiction'`, outcome `awaiting_review`) — never
  `consistent`. `routeAfterJudge` checks `evaluation_failed` first, unconditionally routing to
  `awaitReview` regardless of `autoFix`/`maxFixes`. The in-graph judge prompt now prepends
  `PROMPT_REGISTRY.judge.fewShots`, matching the standalone path.
- Tests: `tests/ai/workflow.spec.ts` (routing unit tests for `evaluation_failed`),
  `tests/ai/judge-fail-closed.spec.ts` (new — graph-level retry/fail-closed/few-shot-parity tests,
  Postgres-gated).
- Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all
  green (292 pass, 356 DB-gated skip, 0 fail).
- Commit: e9cee48e

### P0-02 — Novel-validation coverage + scoped flag updates

- What changed: `novel-validation.graph.ts` now tracks per-window success/failure explicitly
  (`succeededWindows`/`failedWindows` state fields) instead of silently dropping failed/unparseable
  windows. The report gained `windowsRequested`, `windowsSucceeded`, `failedRanges` (additive on the
  existing jsonb `payload`, no migration needed); an all-failed run now summarizes as "No windows
  could be validated this run (0/N succeeded)" instead of the misleading "No issues found."
  `persistReport` builds a `coveredChapters` set from only `succeededWindows` and touches
  `needsRevalidation` exclusively for chapters in that set — chapters in a failed window or outside
  any requested window are left completely untouched, so flags set by earlier bible
  edits/proposals/imports survive a partial/flaky run. FIN_002's read-side logic in
  `generation.service.ts` was not changed — only the correctness of the flag it reads.
- Tests: `tests/ai/validation-persistence.spec.ts` — 3 new Postgres-gated tests: failed windows
  reported as uncovered; `needsRevalidation` not cleared outside covered windows; flags preserved
  when a window fails.
- Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all
  green (547 pass, 10 skip, 0 fail).
- Commit: 8acad8ce

### P0-03 — Repair-ladder accounting

- What changed: `chapter-generation.graph.ts` — the successful-patch branch of `repairPatch`
  (`if (allApplied) return {...}`) now also returns `attempt: state.attempt + 1,
previousFindings: state.findings`, mirroring `repairRewrite`'s existing bookkeeping. This was the
  only `repairPatch` branch that reaches `persistDraft` without going through `repairRewrite` (the
  other two branches set `patchApplied: false` and route to `repairRewrite`, which already
  increments `attempt` — so this was the one gap, and the only place that needed the fix). Both
  repair paths now consume the shared `maxFixes` budget. `sameFinding` replaced its bidirectional
  substring-containment check with exact equality on `severity` + normalized (trimmed, lowercased,
  whitespace-collapsed) `text` — the only fields `JudgeFinding` carries — so two distinct but
  textually overlapping findings no longer get misread as a repeat and abort the ladder early.
- Tests: `tests/ai/workflow.spec.ts` (updated `sameFinding` unit tests: overlapping text no longer
  matches, severity mismatch never matches), `tests/ai/repair-ladder.spec.ts` (new — graph-level
  test asserting repeated successful patches still consume `maxFixes` and fall back to
  `acceptAsIs`).
- Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all
  green (549 pass, 10 skip, 0 fail).
- Commit: 0beb8aa8

### P0-04 — Generation gates: staleness + briefless

- What changed: `generation.service.ts`'s `generate()` no longer silently falls back to drafting
  `[approvedVolumes[0]?.startChapter ?? 1]` when no briefs exist — it now throws `BRF_001` ("No
  brief exists for the requested chapter(s) — outline the plan before generating"). It also gates
  on `briefs.staleReason`: any requested chapter whose brief has a non-null `staleReason` now
  throws `BRF_002` ("Brief is stale for chapter(s) {chapters} — refresh the outline or clear
  staleness before generating"), naming the offending chapter numbers via the existing
  `{placeholder}` interpolation in `ErrorCode.create()`. Both are new `badRequest` codes in a
  "Brief Errors" group in `app-error-code.ts`. No other `generate()` logic (arc-approval gate, job
  dedup, contradiction guard, enqueue/dispatch) was touched.
- Tests: `tests/bible/arc.spec.ts` — 2 new tests reusing the file's existing template-DB
  `GenerationService` fixture: rejects generation for stale briefs (`BRF_002`); errors instead of
  drafting without a brief (`BRF_001`).
- Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all
  green (551 pass, 10 skip, 0 fail).
- Commit: 3415ff30

### P0-05 — Batch adjacency

- What changed: `context-assembler.service.ts`'s `forChapter` — when chapter N−1 has no canonical
  `chapters` row (mid-batch, unfinalized), it now falls back to the latest draft's prose tail (same
  `truncateAtParagraphTail(..., PREV_ENDING_TAIL)` slicing the canonical path already uses),
  prefixed with `[DRAFT — not yet canon]` and tagged `tier: 'working'`, added alongside the
  existing `continuation_state` section. If neither a canonical row nor a draft exists, no
  `prev_ending` section is added (unchanged first-chapter behavior). `job.executor.ts`'s
  `runGenerate` now halts the batch — logs a warning, records `{ phase: 'awaiting_review', skipped:
[...] }` via job progress, and returns — whenever a chapter's `WorkflowRunResult.outcome !==
'accepted'` (covers `accepted_with_findings` and `awaiting_review`, on top of the pre-existing
  `status === 'failed'` throw). `job.service.ts` gained an optional `skipped?: number[]` field on
  the free-form `JobProgress` type to carry the un-run chapter numbers (the `jobs.status` enum has
  no `awaiting_review` value and extending it would be a migration — out of scope; the progress
  snapshot is the durable signal instead, consistent with how other job kinds already use
  `phase`).
- Tests: `tests/ai/context-assembler.spec.ts` (draft-tail fallback included and labeled
  provisional; no section when neither canonical nor draft exists),
  `tests/jobs/job-executor-generate.spec.ts` (new — clean batch drafts every chapter;
  `accepted_with_findings` and `awaiting_review` both halt and record skipped chapters; `failed`
  still throws).
- Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all
  green (557 pass, 10 skip, 0 fail).
- Commit: 523abe4f

### P0-06 — Style and ending-contract constants

- What changed: `authoring-preamble.ts`'s `DEFAULT_WRITING_INSTRUCTIONS` replaced verbatim with the
  approved web-novel style spec (Clarity/Paragraphs/Scenes/Description/Emotion/Dialogue/
  Exposition/Pacing-and-endings/Originality) plus the anti-monotone guard line ("Simple does not
  mean flat. Vary rhythm; let a strong moment land in a longer sentence."). Added a new
  `AUTHORING_STYLE_PLANNING` constant (POV, voice, canon-consistency only — no prose-craft rules)
  and switched every planning-time prompt (`plan`, `outline`, `arc-plan`, `new-novel`,
  `premise-enhance`, `chat-refine`, all 6 `bible-builder/*` prompts) to it; `fix`, `revision`,
  `reforge-write`, `rebrand-convert` keep the full `AUTHORING_STYLE`. `HookType` (`enums.ts`,
  `ending-contract.schema.ts`) widened with `closure_with_momentum`/`earned_rest`; `change-set.ts`'s
  independent `HOOK_TYPES` validation array (chat-hub proposals) widened too, since it would
  otherwise silently reject the new closure hooks. "Never conclusively" reworded in
  `outline.schema.ts`'s description and `outline.prompt.ts`/`generation.prompt.ts`'s prompt text to
  respect the contracted mode instead of blanket-forbidding closure. The two conflicting word
  targets (2000–3000 in the old instructions, 1800–2200 in `generation.schema.ts`'s description)
  unified to a single **1,800–2,600** figure, stated in `generation.prompt.ts`'s system text
  (prompt-visible — schema field descriptions are stripped before reaching the model, confirmed via
  `validate.ts`). No file-based prompt goldens exist in this repo; "render goldens" are substring
  assertions in `tests/ai/prompts.spec.ts`, which still pass since `AUTHORING_STYLE_PLANNING` shares
  `AUTHORING_STYLE`'s header/first bullet. Per-project `instructions` override was verified
  untouched and still wins over the default.
- Tests: `tests/ai/prompts.spec.ts` (new `EndingContractSchema` describe block — accepts tension and
  closure hooks, rejects unknown), `tests/refinement/change-set.spec.ts` (accepts closure hooks on
  `brief.update`), `tests/ai/context-assembler.spec.ts` (updated stale word-count assertion).
- Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all
  green (561 pass, 10 skip, 0 fail).
- Note: a Serena MCP symbolic-edit call from the sub-agent briefly wrote corrupted content into the
  **main checkout** version of `authoring-preamble.ts` (not this worktree) before the sub-agent
  caught it and switched to worktree-scoped edits for the rest of the task. The coordinator found
  and discarded that unstaged main-checkout corruption via `git checkout --` before reviewing this
  task's actual (correct) worktree diff. No corrupted content ever reached a commit or main's
  history.
- Commit: df2c0bb0

### P0-07 — Chapter-context correctness

- What changed: `forChapter` now looks up the chapter's covering arc via `brief.arcKey` and, when
  present with non-empty content, pushes a new `arc_objective` section (objective + escalation +
  hook joined, tier `approved_intent`) — degrades cleanly to no section for arc-less volumes. The
  duplicated `brief` pack section is removed; the `chapterBrief` template var (also read by
  `repairRewrite`) is untouched and remains the single authority. `applyBudget`
  (`token-budget.ts`) now returns `{ fitting, omitted }` instead of silently dropping sections that
  don't fit — `omitted: Array<{ key, reason: 'budget' | 'unresolved' }>` is persisted on the
  `context_packs` row (new nullable `omitted` jsonb column, additive migration) and surfaced through
  `ContextPreviewResponse.omitted` on the refinement context-preview endpoint. `unresolvedRefs`
  (refs that never resolved to a section) stays a separate, parallel mechanism — folding it in would
  require it to carry token/section shape it doesn't have and would break its existing API contract;
  `reason: 'unresolved'` is reserved in the type for a future producer but nothing populates it yet.
  `novel-forge-web`'s `api-types.gen.ts` was regenerated for the new field per the server↔web
  contract rule (using the hermetic single-app compose pattern, not `--all`, to avoid dragging in
  unrelated web apps); the regen also picked up ~100 lines of pre-existing JSDoc-description drift
  accumulated since the file's last refresh (last regenerated at an unrelated earlier commit) —
  unavoidable since the generator has no incremental mode, not new scope creep from this task.
- Tests: `tests/ai/context-assembler.spec.ts` (arc_objective present/absent cases, budget-omission
  case, updated `applyBudget` shape), `tests/ai/hardening.spec.ts` (updated `applyBudget` edge cases
  - omission assertions).
- Validation: `bun scripts/verify.ts apps/novel-forge-server` and `bun scripts/verify.ts
apps/novel-forge-web` — both green (novel-forge-server: 564 pass, 10 skip, 0 fail). Also verified
  `bun scripts/gen-api-types.ts apps/novel-forge-web --check` passes post-regen.
- Note: during this task a sub-agent deliberately avoided Serena's symbolic-edit tools (per an
  added safety instruction, following the P0-06 main-checkout corruption incident) and used plain
  Read/Edit instead; confirmed no main-checkout writes occurred.
- Commit: be404dd8

### P0-08 — Extract-job payload

- What changed: `pipeline.controller.ts`'s `POST /extract` enqueued `{ limit: body.limit }`, but
  `JobExecutor.runExtract`'s `ExtractPayload` destructures `{ chapters = [] }` — an unrelated field
  the controller never provided, so the executor's loop always ran zero iterations and the job
  reported success having extracted nothing. `job.executor.ts` needed no change — `chapters` was
  already the field it expected; only the controller's enqueue payload was wrong. Fixed by resolving
  the pending-chapter list server-side at enqueue time via a new
  `ExtractionService.resolvePendingChapters(projectId, limit)` (finalized chapters — `status='done'`
  — with no extraction yet — `summary IS NULL`, the same predicate the existing but never-wired
  `extractBatch` already used — ordered by chapter number ascending, capped at `limit`), which
  `extractBatch` itself now also reuses. The controller enqueues `{ chapters }` matching what the
  executor destructures. Documented in a comment as a manual backfill tool for imported/legacy
  novels; routine extraction-on-finalize stays a separate, not-yet-built path. No DTO shape changed,
  so no `novel-forge-web` api-types regeneration was needed.
- Tests: `tests/novel-import/novel-import.spec.ts` (extended — asserts the enqueued job row's
  payload is `{ chapters: [1, 2] }`, not `{ limit }`), `tests/jobs/job-executor-extract.spec.ts`
  (new — processes every resolved chapter; does nothing on an empty payload, the exact bug this
  guards against; throws/halts on a failed chapter).
- Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all
  green (567 pass, 10 skip, 0 fail).
- Commit: 088c0022

### P0-09 — Outline invariant enforcement

- What changed: `outline.schema.ts` gained `validateOutlineCoverage(briefs, startChapter,
endChapter): string[]`, mirroring `arc-plan.schema.ts`'s `validateArcCoverage` pattern exactly —
  flags duplicate chapter numbers, out-of-range chapters, missing chapters within the span, and any
  adjacent pair where `continuesIntoNextChapter`/`startsFromPreviousChapter` don't chain in both
  directions. `outline.prompt.ts` gained `buildOutlinePrompt(startChapter, endChapter):
PromptModule<OutlineOutput>`, an exact mirror of the existing `buildArcPlanPrompt` factory-closure
  pattern (spreads the static `outlinePrompt` and swaps in a `postValidate` closing over the
  requested span), exported from the prompts barrel alongside `buildArcPlanPrompt`.
  `generation.service.ts`'s `outline()` and `outlineArc()` now build the prompt with the actual
  requested span instead of using the static `PROMPT_REGISTRY.outline`, reusing the existing
  structured-output repair loop as-is. After `structured()` succeeds, a new private
  `dropUnresolvedContextRefs` calls the existing `ContextAssembler.resolveRefs` per brief, strips
  any ref that doesn't resolve from that brief's `requiredContext` in place (never fails the whole
  outline call over one bad ref), and logs what was dropped.
- Tests: `tests/ai/prompts.spec.ts` (new describe block — accepts a valid contiguous span, rejects
  coverage gaps, rejects out-of-range chapters, rejects duplicate chapter numbers, rejects both
  directions of a broken chaining invariant, confirms `buildOutlinePrompt` closes over its span),
  `tests/generation/outline-invariants.spec.ts` (new — end-to-end `outline()` with a mocked router
  and `resolveRefs`, asserting an invented ref is stripped from the persisted brief while valid refs
  survive; plus direct assertions on the coverage/duplicate/chaining rejections through the same
  `postValidate` wiring the service uses).
- Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all
  green (577 pass, 10 skip, 0 fail). Fixed two issues surfaced by the coordinator's own verify pass
  beyond what the sub-agent reported clean: a Prettier formatting nit and a `hookType: 'cliffhanger'`
  string-literal-widening type error in the new test's shared `brief()` helper (needed `as const`).
- Commit: 7fb3c080

## Pending

None.

## Blocked

None.
