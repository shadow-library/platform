# Harness Implementation Status

Source spec: `harness-final-recommendation.md`, Section 10 (P0 Implementation Plan).
Only P0 items are tracked here for now; P1/P2 will be broken down once P0 is validated per §14.

## Summary

- Completed: 6
- In Progress: 0
- Pending: 3
- Blocked: 0

## Tasks

| ID    | Priority | Task                                                                                                          | Status    | Dependencies | Commit   |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------- | --------- | ------------ | -------- |
| P0-01 | P0       | Fail-closed judging + judge few-shot parity                                                                   | COMPLETED | —            | e9cee48e |
| P0-02 | P0       | Novel-validation coverage + scoped `needsRevalidation` updates                                                | COMPLETED | —            | 8acad8ce |
| P0-03 | P0       | Repair-ladder accounting (patch attempt budget + `sameFinding` tightening)                                    | COMPLETED | —            | 0beb8aa8 |
| P0-04 | P0       | Generation gates: reject stale briefs, error on briefless fallback                                            | COMPLETED | —            | 3415ff30 |
| P0-05 | P0       | Batch adjacency: draft-tail fallback for N+1, halt batch on non-clean outcome                                 | COMPLETED | —            | 523abe4f |
| P0-06 | P0       | Style/ending-contract constants: replace `DEFAULT_WRITING_INSTRUCTIONS`, widen `HookType`, single word target | COMPLETED | —            | df2c0bb0 |
| P0-07 | P0       | Chapter-context correctness: add arc section, drop duplicated brief, record budget evictions                  | PENDING   | —            | —        |
| P0-08 | P0       | Extract-job payload mismatch fix (resolve chapter numbers server-side at enqueue)                             | PENDING   | —            | —        |
| P0-09 | P0       | Outline invariant enforcement (coverage/uniqueness/chaining via factory closure + catalog ref check)          | PENDING   | —            | —        |

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

## Pending

### P0-07 — Chapter-context correctness

- Affected area: `src/modules/ai/context/context-assembler.service.ts`, `src/modules/ai/context/token-budget.ts`, `src/modules/ai/context/sections.ts`
- Acceptance criteria:
  - New `arc_objective` context section (objective/escalation/hook of the chapter's arc) added to `forChapter`.
  - Duplicated brief pack section removed; template var (`chapterBrief`) remains the single authority, still used by `repairRewrite`.
  - `applyBudget` returns `{ fitting, omitted }`; `omitted` persisted into the context pack JSON with reasons.
  - Tests: pack includes current arc objective; brief not duplicated; budget-evicted sections recorded.

### P0-08 — Extract-job payload

- Affected area: `src/modules/pipeline/pipeline.controller.ts` (+ DTO), `src/modules/jobs/job.executor.ts`
- Acceptance criteria:
  - Controller resolves chapter numbers server-side at enqueue time (`limit` → first N canonical chapters without extraction) and enqueues `{ chapters }` matching what the executor destructures.
  - Documented as a backfill tool (routine extraction moves into finalization under P1 — do not build that here).
  - Tests: enqueues resolved chapter numbers; extraction actually runs via the pipeline endpoint.

### P0-09 — Outline invariant enforcement

- Depends on: none strictly, but touches the same outline path as P0-04/P0-06 — sequence after those to reduce merge friction.
- Affected area: `src/modules/ai/prompts/outline.prompt.ts`, `src/modules/generation/generation.service.ts`
- Acceptance criteria:
  - `buildOutlinePrompt(startChapter, endChapter)` factory (mirroring `buildArcPlanPrompt`) whose closure `postValidate` checks exact contiguous coverage, uniqueness, and `continuesIntoNextChapter` → `startsFromPreviousChapter` chaining.
  - After `structured()` returns, service validates `requiredContext` refs against the catalog; unknown refs stripped/repaired and logged.
  - Tests: rejects outlines with coverage gaps; rejects duplicate chapter numbers; drops refs missing from the catalog.

## Blocked

None.
