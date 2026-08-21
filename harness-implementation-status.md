# Harness Implementation Status

Source spec: `harness-final-recommendation.md`, Section 10 (P0 Implementation Plan).
Only P0 items are tracked here for now; P1/P2 will be broken down once P0 is validated per §14.

## Summary

- Completed: 8
- In Progress: 0
- Pending: 1
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
| P0-07 | P0       | Chapter-context correctness: add arc section, drop duplicated brief, record budget evictions                  | COMPLETED | —            | be404dd8 |
| P0-08 | P0       | Extract-job payload mismatch fix (resolve chapter numbers server-side at enqueue)                             | COMPLETED | —            | 088c0022 |
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

## Pending

### P0-09 — Outline invariant enforcement

- Depends on: none strictly, but touches the same outline path as P0-04/P0-06 — sequence after those to reduce merge friction.
- Affected area: `src/modules/ai/prompts/outline.prompt.ts`, `src/modules/generation/generation.service.ts`
- Acceptance criteria:
  - `buildOutlinePrompt(startChapter, endChapter)` factory (mirroring `buildArcPlanPrompt`) whose closure `postValidate` checks exact contiguous coverage, uniqueness, and `continuesIntoNextChapter` → `startsFromPreviousChapter` chaining.
  - After `structured()` returns, service validates `requiredContext` refs against the catalog; unknown refs stripped/repaired and logged.
  - Tests: rejects outlines with coverage gaps; rejects duplicate chapter numbers; drops refs missing from the catalog.

## Blocked

None.
