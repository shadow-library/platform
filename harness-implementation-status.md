# Harness Implementation Status

Source spec: `harness-final-recommendation.md`, Section 10 (P0 Implementation Plan).
Only P0 items are tracked here for now; P1/P2 will be broken down once P0 is validated per §14.

## Summary

- Completed: 2
- In Progress: 0
- Pending: 7
- Blocked: 0

## Tasks

| ID    | Priority | Task                                                                                                          | Status    | Dependencies | Commit   |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------- | --------- | ------------ | -------- |
| P0-01 | P0       | Fail-closed judging + judge few-shot parity                                                                   | COMPLETED | —            | e9cee48e |
| P0-02 | P0       | Novel-validation coverage + scoped `needsRevalidation` updates                                                | COMPLETED | —            | 8acad8ce |
| P0-03 | P0       | Repair-ladder accounting (patch attempt budget + `sameFinding` tightening)                                    | PENDING   | —            | —        |
| P0-04 | P0       | Generation gates: reject stale briefs, error on briefless fallback                                            | PENDING   | —            | —        |
| P0-05 | P0       | Batch adjacency: draft-tail fallback for N+1, halt batch on non-clean outcome                                 | PENDING   | —            | —        |
| P0-06 | P0       | Style/ending-contract constants: replace `DEFAULT_WRITING_INSTRUCTIONS`, widen `HookType`, single word target | PENDING   | —            | —        |
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

## Pending

### P0-03 — Repair-ladder accounting

- Affected area: `src/modules/ai/graphs/chapter-generation.graph.ts`
- Acceptance criteria:
  - `attempt` increments in `repairPatch` as well as `repairRewrite`, so patch cycles are bounded by `maxFixes`.
  - `sameFinding` uses normalized equality (or same category + same anchor span) instead of bidirectional substring containment.
  - Tests: patch attempts count against `maxFixes`; overlapping finding text is not treated as the same finding.

### P0-04 — Generation gates: staleness + briefless

- Affected area: `src/modules/generation/generation.service.ts`, `src/classes/app-error-code.ts`
- Acceptance criteria:
  - `generate()` excludes briefs with `staleReason` set and fails with a new named error code identifying them.
  - Briefless fallback path (silently drafting `[approvedVolumes[0]?.startChapter ?? 1]`) replaced with an explicit error instructing the caller to outline first.
  - Tests: rejects generation for stale briefs; errors instead of drafting without a brief.

### P0-05 — Batch adjacency

- Affected area: `src/modules/ai/context/context-assembler.service.ts`, `src/modules/jobs/job.executor.ts`, `src/modules/ai/graphs/workflow-run.service.ts`
- Acceptance criteria:
  - `forChapter`: when chapter N−1 has no canonical row, fall back to the latest draft's prose tail (same ~500-token tail) labeled `[DRAFT — not yet canon]`, alongside existing continuation state.
  - `runGenerate` halts the batch (remaining chapters marked skipped, job `awaiting_review`) when a chapter's outcome is not clean (`accepted_with_findings` / `awaiting_review` with blocking findings) — not only on `status === 'failed'`.
  - Tests: previous draft tail included when predecessor unfinalized; batch halts when a chapter is accepted with findings.

### P0-06 — Style and ending-contract constants

- Affected area: `src/modules/ai/prompts/authoring-preamble.ts`, `src/modules/ai/schemas/enums.ts`, `ending-contract.schema.ts`, `outline.schema.ts`, `generation.prompt.ts`, `generation.schema.ts`; prompt goldens
- Acceptance criteria:
  - `DEFAULT_WRITING_INSTRUCTIONS` replaced with report §13 web-novel style spec + anti-monotone guard ("simple does not mean flat...").
  - Prose-craft bullets stripped from the planning variant of `AUTHORING_STYLE` (used by bible/plan/outline/arc-plan prompts); POV/canon/originality rules kept.
  - `HookType` widened with `closure_with_momentum` and `earned_rest`.
  - "Never conclusively" wording reworded in both `outline.schema.ts` and `generation.prompt.ts` to allow contracted closure modes.
  - Single word target stated once (pick 1,800–2,600, remove the conflicting/duplicated target).
  - Golden prompt snapshots regenerated; test: ending contract accepts closure hook types.

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
