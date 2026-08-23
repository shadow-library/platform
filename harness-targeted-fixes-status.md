# Harness Targeted Fixes Status

Source: `harness-post-implementation-review.md` (verdict: NEEDS TARGETED FIXES), §18 "Required Fixes
Before Evaluation", cross-checked against `harness-final-recommendation.md` for architectural
alignment. Scope is corrective only — no new subsystems, no re-litigating P0/P1 architecture.

**Eleven required fixes were completed, then re-verified by Codex** (`harness-targeted-fixes-
verification.md`, verdict: NEEDS TARGETED FIXES). That pass found four remaining narrow gaps inside
already-"complete" FIX-01/05/06/03, tracked as FIX-12..FIX-15 below. **All fifteen fixes are now
complete** — this second round closed every remaining gap from the Codex re-verification pass.

## Summary

- Completed: 19
- In Progress: 0
- Pending: 0
- Blocked: 0

**All three FINAL-01..FINAL-03 blockers from `harness-final-recommendation.md` §10 were closed, then
Codex found one further gap in FINAL-01's lease takeover: no ownership fencing. Tracked as FINAL-04.**

**Round three**: `harness-final-recommendation.md` §10 identified three final blockers surviving the
fifteen fixes above (concurrent duplicate finalization, `generateGrok` ancestor overwrite, mixed-
proposal replay). Tracked as FINAL-01..FINAL-03 below.

## Tasks

| ID       | Severity | Task                                                                                                                                                              | Status    | Dependencies |
| -------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------ |
| FIX-01   | CRITICAL | Make chapter finalization recoverable/idempotent across prose commit → extraction → apply → cursor                                                                | COMPLETED | —            |
| FIX-02   | CRITICAL | Reject mutation/deletion of finalized drafts; fix cross-table renumbering invariant on delete                                                                     | COMPLETED | —            |
| FIX-03   | HIGH     | Read `character_states` + current relationships into `forChapter`; validate entity keys before applying extraction                                                | COMPLETED | —            |
| FIX-04   | HIGH     | Render `brief.pov` into generation/judge brief; guarantee POV entity card priority                                                                                | COMPLETED | —            |
| FIX-05   | HIGH     | Arc reconciliation observes events inside the current arc, not `arc.chapterStart`; protect/invalidate already-drafted descendants                                 | COMPLETED | FIX-02       |
| FIX-06   | HIGH     | Continuity extraction receives existing key vocabulary; validate relationship targets/evidence; route ambiguous mutations to review                               | COMPLETED | —            |
| FIX-07   | HIGH     | Bible stage output instructions match schema; persist stage atomically; fix `bible_doc` ref format mismatch                                                       | COMPLETED | —            |
| FIX-08   | HIGH     | Gate/cap the legacy whole-book `outline()` endpoint so it cannot overwrite protected arc briefs                                                                   | COMPLETED | —            |
| FIX-09   | MEDIUM   | Align `revealChapter` catalog semantics with the actual knowledge ledger                                                                                          | COMPLETED | —            |
| FIX-10   | MEDIUM   | Require `briefCompliance` at runtime; fail closed if the judge omits it                                                                                           | COMPLETED | —            |
| FIX-11   | MEDIUM   | Use one writing-style policy across generation, fix, and revision prompts                                                                                         | COMPLETED | —            |
| FIX-12   | HIGH     | Cursor-only finalization retry must not re-extract or reapply continuity (residual gap in FIX-01)                                                                 | COMPLETED | FIX-01       |
| FIX-13   | HIGH     | Ancestor draft changes (update/import/revise) must invalidate drafted descendants (residual gap in FIX-05)                                                        | COMPLETED | FIX-05       |
| FIX-14   | HIGH     | Low-confidence continuity entries must stay reachable for review, not marked applied (residual gap in FIX-06)                                                     | COMPLETED | FIX-06       |
| FIX-15   | HIGH     | Character-state merge must replace/clear fields per the extraction contract, not `COALESCE`-merge stale values (residual gap in FIX-03)                           | COMPLETED | FIX-03       |
| FINAL-01 | CRITICAL | Concurrent duplicate finalization: two racing finalize calls can both pass the pre-application marker check and apply different continuity deltas                 | COMPLETED | —            |
| FINAL-02 | HIGH     | `generateGrok` can overwrite an ancestor chapter without invalidating non-final descendant drafts or honoring the finalized-chapter guard                         | COMPLETED | —            |
| FINAL-03 | HIGH     | Review approval of a held (low-confidence) continuity entry replays already-applied high-confidence siblings from an older proposal, overwriting newer canon      | COMPLETED | —            |
| FINAL-04 | CRITICAL | Continuity claim lease lacks ownership fencing: a stale owner whose lease expired can still persist/apply continuity and clear a new owner's claim after takeover | COMPLETED | FINAL-01     |

Ordering rationale: data-integrity/recoverability (FIX-01, FIX-02) before state/context-correctness
gaps that bias prose quality without corrupting data (FIX-03–06), before control-flow/integration
gaps (FIX-07, FIX-08), before medium-severity control-flow/consistency items (FIX-09–11). This is not
strictly the audit's §18 row order.

## Classification

### Required Before Evaluation (this tracker, FIX-01..FIX-11)

All eleven rows of `harness-post-implementation-review.md` §18 ("Required Fixes Before Evaluation").
The audit's own verdict is that these — not the Medium/Low findings below — are what block a
trustworthy before/after novel-generation comparison.

### Safe to Defer

Real, audit-confirmed issues, but not required before controlled evaluation. Revisit after FIX-01..11
land and an evaluation pass runs, per `harness-final-recommendation.md` §14's evaluate-before-next-work
principle.

- **M4** — writing-style section not guaranteed by greedy budget ordering. Requires an unusually large
  reference set to trigger; not a normal-path blocker per the audit's own assessment.
- **M5** — best-effort reconciliation/epitome failures have no durable retry. Already-known limitation
  (documented at P1-10/P1-11 as "best-effort"); needs a retry-job mechanism, which is P1/P2-scale work,
  not a targeted fix.
- **M6** — continuity schema still requires unused `timeline`/`power` output, `knowledgeChanges`
  generated but not applied. Token/decorative-output cleanup, not a correctness or data-integrity risk
  (P1-07 already documents the `knowledgeChanges` non-application as a deliberate trust-boundary
  decision).
- **M7** — planning catalog only partly bounded (per-category caps missing). Long-term scaling risk,
  matches `harness-final-recommendation.md` D24 (already P2-deferred there).
- **M8** — in-process generation exclusion is not a cross-instance lock. Only matters under horizontal
  deployment, which this evaluation phase does not use.
- **L1** — context-pack dedup can alias audit metadata. Observability-only; generation input itself
  stays correct.
- **L2** — `relationship_observations` is transitional dead storage. Already identified and
  deliberately left alone during P1-08; no live path depends on it being fixed now.

### No Action

- None beyond what's folded into "Safe to Defer" above — every Medium/Low finding in the audit is a
  real, confirmed issue, just not evaluation-blocking.

---

## In Progress

None.

## Pending

None.

## Blocked

None.

## Completed

### FINAL-01 — Concurrent duplicate finalization

Missing invariant: for a given chapter/version, at most one logical continuity-finalization operation
may acquire the right to extract/apply authoritative continuity. `extractContinuity`
(`chapter-finalization.graph.ts`) previously did a plain check-then-act read of
`chapters.continuityApplied`: two concurrent `finalize()` calls for the same chapter could both observe
`false`, both call the (non-deterministic) continuity extractor, and both apply conflicting canon
mutations in separate transactions — reproduced against real PostgreSQL.

What changed: `extractContinuity` now takes an atomic durable claim before extracting anything — a
single `UPDATE chapters SET continuity_claimed_at = now(), continuity_claimed_by = $runId WHERE
project_id = $p AND number = $n AND continuity_applied = false AND (continuity_claimed_at IS NULL OR
continuity_claimed_at < $staleBefore) RETURNING id`. Postgres row-level locking on the UPDATE makes this
genuinely atomic under real concurrency — only one of two simultaneous callers can match the `WHERE`
and receive a row back.

- Claim acquired → proceed with extraction as before.
- No row returned, `continuityApplied` is `true` → safe no-op resume (today's behavior, unchanged).
- No row returned, `continuityApplied` is `false` → another worker holds a live claim; throws
  `AppError.internal('… already in progress')`, which `workflow-run.service.ts`'s existing `try/catch`
  turns into a `{ status: 'failed' }` result — the caller can retry later, exactly like any other
  finalization failure.
- The claim is a 5-minute lease (`CONTINUITY_CLAIM_LEASE_MS`) compared against the app clock (the
  claim timestamp is app-clock-written, so comparing against `now()` would mix two clocks) — a worker
  that dies mid-extraction does not permanently brick the chapter; a later run can steal the stale
  claim once the lease expires.
- Two new `chapters` columns: `continuity_claimed_at`, `continuity_claimed_by` (both nullable).
- A `releaseClaim` helper clears both columns; `extractContinuity`'s model call + proposal upsert and
  `applyContinuity`'s transaction both release the claim on failure before rethrowing, so a fast
  failure doesn't force the next retry to wait out the full lease. A committed `applyContinuity`
  transaction already sets `continuityApplied = true`, which makes the claim columns moot for every
  future read — no separate release-on-success path.

Regression tests (`tests/ai/finalization-resume.spec.ts`, graph-level against real Postgres):

- Two concurrent `graph.invoke()` calls for the same chapter, synchronized with a deterministic
  barrier (no sleeps) so both are genuinely inside `extractContinuity` at the same logical instant.
  Asserts exactly one call fulfills, the other rejects with `/already in progress/`, the model is
  called exactly once, `continuityApplied` ends `true`, and exactly one entity exists afterward (never
  both, never neither). A subsequent retry after the race settles is a safe no-op. Confirmed non-vacuous
  by temporarily relaxing the claim `WHERE` clause — reproduces the original double-apply.
- A failing extraction releases the claim (`continuityClaimedAt`/`By` both `null`) so an immediate
  retry is not blocked for the lease window, and that retry succeeds normally.

Files changed: `src/database/schemas/chapters.ts`, `generated/drizzle/0015_perpetual_marvel_apes.sql`
(+ meta), `src/modules/ai/graphs/chapter-finalization.graph.ts`, `tests/ai/finalization-resume.spec.ts`.

Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all green,
1029 pass, 10 skip, 0 fail (independently re-run, not just trusted from the implementing sub-agent).

Commit: `848042e2` (fast-forwarded to `main`).

### FINAL-02 — `generateGrok` ancestor overwrite

Missing invariant: every chapter-replacement path must obey the same mutation guard (reject a
finalized-chapter overwrite) and descendant-invalidation invariant (mark later non-final drafts stale)
as `updateDraft`/`reviseDraft`/`importDraft`, with the replacement and invalidation committed
atomically. `generateGrok` (`generation.service.ts`) upserted a draft with no final-status guard and
never called `markDescendantDraftsStale` — it could silently overwrite a locked/finalized chapter, and
regenerating a non-final chapter left later drafted chapters looking valid against superseded prose.

What changed:

- `markDescendantDraftsStale` gained an optional trailing DB-client parameter (`DraftWriter = Pick<PrimaryDatabase, 'update'>`,
  defaulting to `this.db`) so it can run inside a caller's transaction. The three existing call sites
  (`updateDraft`, `reviseDraft`, `importDraft`) are untouched — they still call it with three arguments
  and run outside any transaction, exactly as before.
- `generateGrok` gained a cheap pre-model-call guard (`existing?.status === 'final'` → `DRF_002`) to
  fail fast before spending a model call on a doomed request — advisory only, not the correctness
  guarantee.
- The actual replacement now runs inside `this.db.transaction(async tx => {...})`: the `drafts` upsert
  reuses the exact `onConflictDoUpdate({ setWhere: ne(status, 'final') })` compare-and-set pattern
  already established in `chapter-finalization.graph.ts`'s `commitProse` for `chapters.locked` — a
  single atomic statement, not a separate check-then-write. An empty `.returning()` is disambiguated by
  re-reading inside the same transaction: `final` → `DRF_002`, otherwise → `DRF_001`. On success,
  `markDescendantDraftsStale(..., tx)` runs in the same transaction before it commits, so a crash
  between "chapter replaced" and "descendants invalidated" is impossible — either both land or neither
  does.

Regression tests (`tests/generation/draft-mutation-guards.spec.ts`, real Postgres template DB, new
`describe('generateGrok')` block):

- Final chapter rejected with `DRF_002`; draft row (body/title/summary/status/revision) unchanged.
- Non-final chapter replaced; two later non-final descendants both get
  `staleReason: 'ancestor chapter N was regenerated'`, and an `approved` descendant is downgraded to
  `needs_review` — transitively, matching `markDescendantDraftsStale`'s existing `chapter > N`
  predicate.
- Atomicity: a `Proxy` traps `update` on the transaction handle so it throws between the upsert and
  the invalidation writes (adapted from `finalization-resume.spec.ts`'s proxy pattern, lifted onto
  `db.transaction` since a `db.update` trap is invisible inside a transaction). Asserts the ancestor
  draft is completely unchanged afterward — the transaction rolled back, not "new ancestor committed,
  descendants still looking valid," which was the exact bug.
- Unrelated project and earlier chapter both untouched.

Files changed: `src/modules/generation/generation.service.ts`,
`tests/generation/draft-mutation-guards.spec.ts`.

Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all green,
1033 pass, 10 skip, 0 fail (independently re-run, not just trusted from the implementing sub-agent).

Commit: `5202b0a8` (fast-forwarded to `main`).

### FINAL-03 — Mixed-proposal replay

Missing invariant: review approval must apply only the still-pending (held) subset of a proposal —
never replay siblings already committed to canon — and must never let an older chapter's delta
overwrite state a newer chapter has already advanced past. `applyContinuityProposal`
(`generation.service.ts`) and the finalization graph's `applyContinuity` node
(`chapter-finalization.graph.ts`) both re-run `applyContinuityDelta` against the _entire_ stored
`continuityProposals.proposal` JSON — including the high-confidence siblings a prior auto-apply pass
already committed. A human editing/approving a held low-confidence entry later therefore replays those
already-applied siblings, overwriting canon that later, independently-finalized chapters have since
advanced (reproduced: chapter 10's high-confidence `location`/`threadX` auto-apply plus a held low-
confidence entry; chapter 12 independently advances `location`/`threadX`; approving chapter 10's held
entry reverted both back to their chapter-10 values).

What changed:

- New `filterToHeldEntries(delta)` in `apply-continuity.ts`: returns a `ContinuityOutput` with
  `newEntities`/`appeared`/`timeline`/`power`/`knowledgeChanges` zeroed (already durably applied or
  deliberately never persisted — replaying them can only regress state) and each of the four
  confidence-bearing arrays (`threads`/`mysteries`/`relationships`/`characterStates`) filtered down to
  only their `confidence === 'low'` members.
- Both call sites — the finalization graph's `applyContinuity` node and the service's
  `applyContinuityProposal` — now `set({ proposal: filterToHeldEntries(delta), updatedAt })` instead of
  leaving the stored proposal untouched whenever `hasHeldEntries` is true. A second, partial approval
  (some entries fixed, others still held) shrinks the persisted proposal further each time, so nothing
  already-applied is ever eligible for replay on a subsequent approval either.
- A chronological guard added to `applyContinuityDelta`'s `threads`/`mysteries`/`characterStates` loops
  (not `relationships`, which are already append-only per-chapter rows with no "current" row to
  protect): before writing, each loop checks whether the existing row's tracking column
  (`lastAdvancedChapter`/`lastUpdatedChapter`) is strictly greater than the incoming `chapter` — if so,
  skip with a `logger.warn` matching the file's existing skip-and-log style, since applying would move
  that key's canon backwards in time. Equal-chapter re-approval still applies (stays idempotent); the
  guard never fires during ordinary chapter-by-chapter finalization, since the graph's own guard already
  enforces strictly increasing chapter order.

Regression tests (`tests/ai/continuity-apply.spec.ts`, real Postgres template DB):

- The exact chapter-10/chapter-12 reproduction: approving chapter 10's held entry leaves chapter 12's
  thread status and character location intact, and applies the held entry. Confirmed to fail against
  pre-fix code (thread/location revert) via a targeted `git stash` of only `src/`.
- Persisted proposal shrinks to only the held entry immediately after the graph's auto-apply pass.
- A fully-applied proposal refuses a second approval (`CNT_001`) without corrupting canon.
- Chronology guard: a held-at-chapter-5 entry approved after chapter 8 independently advanced the same
  key does not move it backward; the chapter-8 value and tracking column survive.
- Boundary case: re-approval at the exact chapter a key was last advanced still applies (guards against
  an off-by-one `>=` mistake).

Files changed: `src/modules/ai/graphs/apply-continuity.ts`,
`src/modules/ai/graphs/chapter-finalization.graph.ts`, `src/modules/generation/generation.service.ts`,
`tests/ai/continuity-apply.spec.ts`.

Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all green,
1038 pass, 10 skip, 0 fail (independently re-run, not just trusted from the implementing sub-agent).

Commit: `70271d61` (fast-forwarded to `main`).

### FINAL-04 — Fence stale finalization claim owners

Missing invariant: once a finalization claim is no longer owned by a run, that stale run must be
incapable of persisting, applying, completing, or releasing authoritative continuity for that
chapter/version. FINAL-01's lease (`continuityClaimedAt`/`continuityClaimedBy`) let a second caller
take over after expiry, but nothing re-verified ownership before the original caller's proposal
persistence, continuity application, completion, or release — a stale owner (Codex example: extraction
running past the 5-minute lease) that finished its work after losing the lease could still write, and
its failure-path release was unscoped and could clear the new owner's live claim.

What changed:

- `continuityClaimedBy` (already a unique per-run UUID, `state.runId`) becomes the load-bearing fencing
  token — its schema comment was corrected to say so.
- New `assertOwnsClaim(tx, projectId, chapter, runId, node)` helper in `chapter-finalization.graph.ts`:
  a conditional `UPDATE chapters SET updatedAt WHERE projectId/number AND continuityClaimedBy = runId
AND continuityApplied = false RETURNING id`, called as the FIRST statement inside a transaction. Being
  an `UPDATE` rather than a `SELECT` matters: it takes and holds the row lock on that `chapters` row for
  the rest of the enclosing transaction, so no concurrent takeover can commit until the transaction
  resolves — turning "check ownership" into an atomic fence rather than a check-then-act race. A failed
  check throws, rolling back everything the transaction had done, so a lost claim never leaves partial
  canon.
- `extractContinuity`'s previously-bare proposal upsert is now wrapped in its own transaction with
  `assertOwnsClaim` as its first statement — closes the gap where a slow LLM call returning after
  takeover could still persist a stale proposal.
- `applyContinuity`'s existing transaction gained `assertOwnsClaim` as its first statement, before
  `applyContinuityDelta` runs — the row lock it takes covers the delta writes and the
  `continuityApplied = true` write later in the same transaction, so that final write needed no
  redundant ownership condition of its own.
- `releaseClaim` now requires the caller's `runId` and adds `continuityClaimedBy = ownerRunId` to its
  WHERE clause — a stale owner's failure-path release is now a no-op once someone else owns the claim,
  never clearing another run's live claim.

Failure scenarios verified (real Postgres, deterministic — lease staleness simulated by backdating
`continuityClaimedAt` directly, no real waits/timers):

- **Stale owner cannot persist after takeover**: run A parks mid-extraction, its claim is backdated,
  run B finalizes end-to-end for real with a conflicting delta, A then resumes and is rejected with a
  fencing error; only B's entity/proposal/cursor state exists.
- **Stale owner's release cannot clear the new owner's claim**: after the above sequence, the chapter's
  `continuityClaimedBy`/`continuityClaimedAt` still reflect B's live claim, not nulled by A's unwind.
- **Stale owner cannot apply after a takeover injected between extraction and application**: A extracts
  and persists its own proposal (still legitimately owns the claim at that point), takeover is injected
  before the application transaction; A is fenced there instead — `continuityApplied` stays `false`,
  zero entities exist; B then finalizes normally and owns the result.
- **Ordinary idempotent retry is unaffected**: the pre-existing single-owner and completed-retry tests
  in this file pass unmodified — `assertOwnsClaim` never fires for a sole legitimate owner, since its
  own `runId` always matches its own claim.
- **Non-vacuousness**: verified each new test fails against a weakened `assertOwnsClaim` (no-op'd
  entirely, or with the `continuityClaimedBy` condition dropped) and against an unconditional
  `releaseClaim`, then confirmed all pass again with the real fix restored.

Regression tests (`tests/ai/finalization-resume.spec.ts`, extended the existing real-Postgres harness
with a `beforeTransaction(index)` seam on the test proxy for injecting a takeover between numbered
transactions, and a `backdateClaim` helper):

- `should refuse to persist continuity from a run whose claim was taken over after the lease expired`
- `should leave the new owner claim intact when the superseded run unwinds`
- `should refuse to apply continuity from a run that lost the claim between extraction and application`

Files changed: `src/database/schemas/chapters.ts`,
`src/modules/ai/graphs/chapter-finalization.graph.ts`, `tests/ai/finalization-resume.spec.ts`.

Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all green,
1041 pass, 10 skip, 0 fail (independently re-run, not just trusted from the implementing sub-agent; one
earlier run hit 2 transient failures from local Postgres connection-pool exhaustion, unrelated to this
change — a clean immediate rerun passed).

Commit: `<filled in after commit>`

### FIX-01 — Make chapter finalization recoverable/idempotent

Source finding: `harness-post-implementation-review.md` C1 ("Finalization can commit prose and then
fail with no supported recovery") + §13 failure-handling table + §18 row 1.

What changed:

- `GenerationService.finalize()` no longer trusts `draft.status === 'final'` alone as proof a chapter
  is done. A new `isChapterFinalized()` checks the actual end-state (`chapters.continuityApplied` —
  or `generator === 'grok'`, which skips continuity extraction entirely — and
  `projects.storyCurrentChapter >= chapter`). Only a truly finalized chapter still rejects with
  `DRF_002`. A `final` draft over a chapter that isn't actually finalized (continuity extraction/apply
  failed, or the cursor advance failed) logs a warning and falls through to re-invoke
  `runChapterFinalization` instead of being rejected.
- The `DRF_004` ("not approved") check, which previously ran unconditionally and blocked every retry
  before the `DRF_002` check was even reached (draft `reviewStatus` is `'final'`, not `'approved'`,
  after the first attempt's `commitProse`), now only applies to non-final drafts.
- `chapter-finalization.graph.ts`'s `guard` node accepts `reviewStatus === 'final'` alongside
  `'approved'`, since the service layer above it has already established a `final` draft reaching the
  graph again is a legitimate resume, not a duplicate.
- `maybeReconcileArc`/`maybeWriteVolumeEpitome` no longer run when `runChapterFinalization` returns
  `status !== 'completed'`.
- No new checkpoint/resume machinery was built: every finalization-graph node (`commitProse`,
  `extractContinuity`, `applyContinuity`, `updateIndexes`, `advanceCursor`) was already idempotent by
  design (upserts on stable natural keys, `setWhere: ne(locked, true)`, `if (chapter > currentChapter)`
  guards) — verified by reading `apply-continuity.ts` in full. A full re-run from `START` on retry was
  the smallest correct fix.

Known limitation, not in scope: the no-`chapter` auto-select branch of `finalize()` only looks for
`reviewStatus: 'approved'` drafts, so a partially finalized chapter can currently only be resumed by
passing its chapter number explicitly, not via the "finalize the next approved draft" convenience path.

Tests: `tests/generation/finalize-guards.spec.ts` (+6: resume after continuity failure, resume after
cursor failure, fully-finalized duplicate still `DRF_002` and never reaches the graph, never-approved
draft still `DRF_004`, no arc-reconciliation/epitome side effects on a failed run with a
completed-run positive control), `tests/ai/finalization-resume.spec.ts` (new — graph-level resume
against real Postgres with a stubbed router/indexer and `MemorySaver`). Confirmed against pre-fix code:
4 service tests and the graph resume test fail before the fix, pass after.

Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all green,
965 pass, 10 skip, 0 fail (independently re-run, not just trusted from the implementing sub-agent).

Commit: `7aeb29ca`

### FIX-02 — Reject mutation/deletion of finalized drafts; remove cross-table renumbering

Source finding: `harness-post-implementation-review.md` C2 ("Draft mutation APIs can desynchronise
canonical chapters, briefs, and numbering") + §18 row 2.

What changed:

- `updateDraft` and `importDraft` now look up the existing draft at `(projectId, chapter)` before
  upserting; if it exists and `status === 'final'`, both reject with `DRF_002` instead of silently
  overwriting prose behind a locked canonical chapter. Mirrors the guard `reviseDraft` already had.
- `deleteDraft` rejects a `status: 'final'` draft with `DRF_002` instead of deleting it and orphaning
  the locked `chapters` row.
- `deleteDraft`'s gap-closing renumber (of `drafts`, `continuityProposals`, and — via
  `ChapterImageService.onChapterDeleted` — `chapterImages`) was removed entirely, not extended to cover
  briefs. **Decision, made in this pass since neither audit doc addresses it directly**: cascading the
  renumber to `briefs` was rejected as materially riskier (briefs participate in arc range bookkeeping,
  the hand-edited/finalized-chapter protection guard, and knowledge-contract/POV fields — correctly
  renumbering all of that is a bigger change than this fix's scope). Leaving a hole at the deleted
  chapter number is safe: that chapter's brief is untouched and still describes the correct chapter;
  regenerating later creates a fresh, correctly-matched draft. This is a deliberate behavior change from
  previously-tested renumbering — the old tests encoded the bug, not a requirement to preserve.

Tests: `tests/generation/delete-draft.spec.ts` — the two renumbering-specific tests rewritten to assert
the new no-renumber behavior; new test asserting a final draft rejects with `DRF_002` and leaves all
chapters/numbers untouched. `tests/generation/chapter-image.spec.ts` updated to match (no image shift).
New `tests/generation/draft-mutation-guards.spec.ts` (6 cases): `updateDraft`/`importDraft` reject-on-
final (row unchanged), and both still work normally on non-final/absent drafts.

Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all green,
972 pass, 10 skip, 0 fail (independently re-run).

Commit: `2359c340`

### FIX-03 — Complete the dynamic-state read path

Source finding: `harness-post-implementation-review.md` H1 ("Dynamic character state is write-only")

- §18 row 3.

What changed:

- `ContextAssembler.forChapter` gained a `dynamicCastSections` step, scoped to the chapter's cast
  (entity keys already resolved from the brief's `contextRefs`, plus `brief.pov` when set) — never a
  project-wide read. It queries `character_states` for those keys and renders a compact
  location/conditions/goal/status block per character (`character_state` section), and queries
  `entity_relationships` for the same cast's entity ids, reduced in application code to the
  highest-`chapter` row per `(entityId, targetKey, kind)` — the append-only table's "current" state —
  rendered as a `relationships` section. Both are volatile-tier (`makeSection(..., 'working', ...)`,
  never `asStable()`'d) since they're per-chapter dynamic facts, not cacheable canon. Neither section
  is pushed when the cast is empty or no rows match — no spurious empty sections.
- `apply-continuity.ts`'s `characterStates` upsert loop now calls the existing `resolveEntityId` guard
  before writing (matching the pattern already used by the `relationships`/`appeared` loops just above
  it) and skips with a `logger.warn` when the extracted `entityKey` resolves to no entity — previously
  it wrote whatever key the model produced unconditionally, letting a hallucinated character-state row
  become a permanent orphan.

**Corruption caught and fixed during review, not by the sub-agent**: the delivered
`context-assembler.service.ts` contained two literal raw NUL bytes (`\x00`) used as a map-key delimiter
inside `latestRelationships`'s `` `${row.entityId}\x00${row.targetKey}\x00${row.kind}` `` template —
functionally inert in a JS string but made the file register as binary to `git diff`/`file`(1) and would
break any text-based tooling (grep, some editors) that touches it. Replaced with a plain `::` delimiter
before commit; re-verified `bun scripts/verify.ts apps/novel-forge-server` after the fix.

Tests: `tests/ai/context-assembler.spec.ts` (+6: full character-state block rendering for a
`contextRefs` cast member, POV-only cast, out-of-cast state excluded from both the section and
`pack.rendered`, latest-wins relationship reduction across two chapters for the same
entity/target/kind triple, no sections on an empty-cast brief, no sections when the cast has no
matching rows), `tests/ai/continuity-apply.spec.ts` (+1: a `characterStates` delta entry with an
unresolvable `entityKey` writes no row while a sibling with a valid key still does).

Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all green,
979 pass, 10 skip, 0 fail (independently re-run after the NUL-byte fix, not just trusted from the
implementing sub-agent).

Commit: `5046e5f0`

### FIX-04 — Render `brief.pov` into generation/judge brief; guarantee POV entity card priority

Source finding: `harness-post-implementation-review.md` H2 ("Brief POV is persisted but never
reaches the chapter writer") + §18 row 4.

What changed:

- `brief-body.ts`'s `ChapterBriefInput`/`renderChapterBrief` (the single authority for the
  `chapterBrief` prompt variable used by both drafting and repair-rewrite) now render a leading
  `POV: <entityKey>` guidance line when `brief.pov` is set; briefs without POV render byte-identically
  to before.
- The judge's separately-built `## BRIEF` block (`chapter-generation.graph.ts`, not routed through
  `renderChapterBrief` by design — a deliberately different format) gained the same `POV: <entityKey>`
  line, so the judge also knows whose perspective it's checking for head-hopping.
- `ContextAssembler.forChapter`: the POV entity's card is now guaranteed present, full-text (not
  truncated at the shared `ENTITY_CARD_BUDGET = 350` cap every other entity ref goes through), and
  first in the `FULL_CAST_MAX` priority slice — even when the outliner forgot to list it in
  `contextRefs`. Implemented without touching `resolveRefs`'s shared truncation/priority behavior
  (which `forOutline`/`forChatTurn`/`forArcPlanning`/rebrand/reforge all depend on): the per-entity
  card-rendering logic was factored out into a module-level `renderEntityCard(entity, maxTokens?)` —
  omitting `maxTokens` renders the body in full, reserved for the POV card — and a new
  `povEntitySection` resolves/renders it directly, unshifted ahead of the `contextRefs`-resolved entity
  sections (de-duplicating if `contextRefs` already listed it) before the existing
  `.slice(0, FULL_CAST_MAX)` runs unchanged. A `brief.pov` naming no real entity fails closed — no
  section, `entity:<pov>` added to `unresolvedRefs` for auditability, matching the existing
  unresolved-ref pattern.

Tests: `tests/generation/brief-guidance.spec.ts` (+POV-line rendering, ordered ahead of chapter
purpose, byte-identical omission when unset), `tests/ai/brief-fulfillment-graph.spec.ts` (+judge
`## BRIEF` block contains `POV:` when set, explicit absence guard when not), `tests/ai/context-
assembler.spec.ts` (+4: full untruncated POV body over 350 tokens, POV card present when absent from
`contextRefs`, POV card survives the `FULL_CAST_MAX` boundary against 6 other entity refs, graceful
degradation + `unresolvedRefs` entry for an unresolvable POV key). Confirmed all six fail on pre-fix
code, pass after.

Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all green,
986 pass, 10 skip, 0 fail (independently re-run).

Commit: `d62022e4`

### FIX-05 — Arc reconciliation observes in-arc events; protects already-drafted descendants

Source finding: `harness-post-implementation-review.md` H3 ("Arc reconciliation does not reliably
observe events inside the arc") + H4 ("Edited or re-planned ancestors do not invalidate drafted
descendants") + §18 row 5.

What changed:

- `outlineArc` now queries the latest `chapters` row with `status = 'done'` inside `[arc.chapterStart,
arc.chapterEnd]` and passes `latestFinalized.number + 1` (or `arc.chapterStart` when nothing in the
  arc has finalized yet — the normal first-outline case, unchanged) as the "as of" chapter to
  `ContextAssembler.forOutline`. Previously every call — including reconciliation calls fired after
  several chapters inside the arc had already finalized — always used the arc's static
  `chapterStart`, so `forOutline`'s "chapters before N" logic never saw anything the arc itself had
  written. Reconciliation now actually reflects in-arc consequences, as the recommendation doc
  requires.
- `protectedBriefsInRange` (used by every `outlineArc` call, manual or automatic) now also protects any
  chapter with an existing non-final `drafts` row, not just finalized/hand-edited chapters. Previously
  reconciliation could silently rewrite a brief's objective/events/POV/knowledge-contract underneath
  prose already drafted against the old version, leaving plan and prose disagreeing with no signal.
  Protecting the brief (decision made in this pass): actively invalidating/flagging the existing draft
  as stale instead was considered and rejected as the larger, riskier change for this fix's scope — no
  "force re-outline over an existing draft" escape hatch was built.

Tests: `tests/generation/arc-reconciliation.spec.ts` (+4): reconciliation's `forOutline` call and
resulting `catalog` prompt content reflect the latest chapter finalized inside the arc; a fresh,
never-outlined arc still anchors on `chapterStart`; a chapter with a non-final draft keeps its brief
unchanged through `outlineArc`; end-to-end through actual reconciliation, a drafted chapter is
preserved while an unprotected chapter is still regenerated. Confirmed against pre-fix code: 3 of the
4 new tests fail (the fresh-arc test correctly passes on both, proving no regression on the normal
path), all pass after.

Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all green,
990 pass, 10 skip, 0 fail (independently re-run).

Commit: `54216149`

### FIX-06 — Continuity extraction trust boundary

Source finding: `harness-post-implementation-review.md` H5 ("Model-extracted state is promoted to
durable canon without the approved trust boundary") + §18 row 6. (FIX-03, already merged, covered the
`characterStates` entity-key validation half of H5 — this fix covers the remainder.)

What changed:

- `extractContinuity`'s model-call context now includes the project's existing `plotThreads` and
  `mysteries` (key, status, summary/question) alongside the entity roster it already sent, as
  `## EXISTING THREADS`/`## EXISTING MYSTERIES` sections. Previously only entities were shown, so the
  extractor had no way to know it should reuse an existing thread/mystery key instead of coining a
  variant — the exact key-fragmentation risk (`missing_heir` / `the_missing_heir` / `heir_mystery`
  becoming three records) the audit named. The prompt (bumped `1.1.0` → `1.2.0`) now instructs the
  model to reuse an exact listed key when an update concerns something already tracked.
- `apply-continuity.ts`'s `relationships` loop now validates `targetKey` the same way it already
  validated the source `entityKey` (via the existing `resolveEntityId` helper), skipping with a
  `logger.warn` on an unresolvable target instead of writing an arbitrary string into
  `entity_relationships.targetKey`.
- `ContinuityRelationship` gained a required `evidence` field (same shape as
  `ContinuityCharacterState.evidence`) — relationship claims previously carried no textual
  justification requirement at all.
- `ContinuityThread`/`ContinuityMystery`/`ContinuityRelationship`/`ContinuityCharacterState` — the
  four types `applyContinuityDelta` writes to durable tables automatically — gained an optional
  `confidence?: 'high' | 'low'` field via a new `ExtractionConfidence` enum. `applyContinuityDelta`
  skips (does not write) any entry marked `confidence: 'low'`, logging it as held for review; the raw
  delta stays on `continuity_proposals.proposal` regardless, the same review surface the existing
  `knowledgeChanges` non-application already relies on. **An absent `confidence` field applies exactly
  as before this fix** — this is additive gating, not a new default-deny posture, so a model/provider
  that doesn't yet emit the field isn't silently blocked from writing anything.

Tests: `tests/ai/continuity-apply.spec.ts` (+: unresolvable relationship target skipped while a
resolvable sibling writes; low-confidence thread/mystery/relationship/characterState entries all
dropped while high-confidence siblings land; confidence-omitted entries still apply to all four
tables — explicit regression guard; `extractContinuity`'s `contextPack` contains seeded existing
thread/mystery keys). `tests/ai/prompts.spec.ts` (+: `ContinuityRelationship` rejects a missing
`evidence`; confidence markers parse on all four types; an out-of-enum confidence value is rejected).

Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all green,
997 pass, 10 skip, 0 fail (independently re-run).

Commit: `a962aaaa`

### FIX-07 — Bible stage output/schema alignment, atomic persistence, ref-format fix

Source finding: `harness-post-implementation-review.md` H6 ("Bible structured generation is not
reliable end-to-end") + §18 row 7. Three independent bugs sharing the bible-builder code area.

What changed:

- `BIBLE_STAGE_OUTPUT_SHAPE` (shared by all six bible-stage prompts + `new-novel.prompt.ts`) said the
  response must be "exactly this shape" showing only `body`/`entities` — contradicting the
  characters/world-power stage prompts' own instructions to also emit `facts`/`worldFacts`. A model
  taking "exactly" literally could legally emit `{body, entities}` and still pass schema validation
  (both fields are optional), silently dropping the stage-specific content. Rewritten to show all four
  `BibleStageSchema` fields (including `entities[].body`) and state explicitly: include a field
  whenever the stage's own instructions ask for it and the section establishes it; never drop a field
  asked for above.
- `indexLore`'s `addLore` call used `${section}:${slug}` as the lore-index refKey; `resolveRefs`'s
  `bible_doc:` case parses refs as `section/slug` (slash-separated). Since retrieval hits render as
  `[${kind}:${refKey}]`, a bible-doc hit was displayed to the model as `[bible_doc:foundation:overview]`
  — a string a model imitating what it saw would produce as a `contextRefs` entry, permanently
  unresolvable. Changed to `/` so the retrieval label naturally forms a valid, resolvable ref.
- `runStage`'s document-body upsert and its three structured-record upsert loops (entities, canon
  facts, world facts) are now one `db.transaction()`; the per-row `.catch(err => logger.warn(...))`
  swallows on the structured writes are removed. Previously a single failed entity/fact/world-fact
  write only logged a warning while the document body still committed — and since the `!force` skip
  check only looks at whether the document has a body, that silent partial write was permanently
  treated as a completed stage, with no way to retry it short of a non-deterministic full `force`
  rebuild. Now any write failure rolls back the whole stage (document included), so a subsequent
  non-force run correctly retries it.

Tests: `tests/ai/bible-builder-graph.spec.ts` (+4): a forced structured-write failure rolls back the
whole stage (zero `bibleDocuments`/entity rows persisted); a subsequent non-force run then retries and
persists cleanly; `indexLore` labels use `/` not `:`; `BIBLE_STAGE_OUTPUT_SHAPE` contains
`facts`/`worldFacts`/`constraintNote`/`revealChapter` and no longer says "exactly this shape".
Confirmed against pre-fix code: reverting just the graph file fails both atomicity tests and the label
test. All 9 pre-existing tests in the file pass unmodified.

Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all green,
1001 pass, 10 skip, 0 fail (independently re-run).

Commit: `35f50034`

### FIX-08 — Gate the legacy whole-book `outline()` endpoint against protected briefs

Source finding: `harness-post-implementation-review.md` H7 ("The public legacy whole-book outliner
can overwrite protected arc briefs") + §18 row 8.

What changed:

`outline()` now calls the existing `protectedBriefsInRange` helper (already extended by FIX-05 to
cover hand-edited briefs, finalized chapters, and chapters with an existing non-final draft) before
its upsert loop, and skips any protected chapter exactly like `outlineArc` already does — returning
the chapter's current row unchanged instead of overwriting it. Also brought `outline()`'s upsert
`values` in line with `outlineArc`'s convention by setting `staleReason: null` and `handEdited: false`
explicitly (previously set neither). No new arc-approval gate was added — `outline()` is deliberately
arc-agnostic (it spans ranges across volumes without per-arc scoping, for projects that may not use
the arc tier at all), so "obey arc gates" doesn't apply the way it does to `outlineArc`; the
protection-rules half of the audit's either/or fix is what's implemented, reusing the already-tested
helper rather than duplicating its logic.

Tests: `tests/generation/outline-invariants.spec.ts` (+5): a hand-edited brief in range survives
`outline()` unchanged; a finalized chapter's brief survives unchanged; a chapter with an existing
non-final draft survives unchanged (proving the FIX-05 draft-protection extension applies here too,
not just in `outlineArc`); an unprotected chapter is still normally written; a normally-upserted
brief has `handEdited: false`/`staleReason: null` set.

Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all green,
1006 pass, 10 skip, 0 fail (independently re-run).

Commit: `ef098ed0`

### FIX-09 — Align `revealChapter` catalog semantics with the knowledge ledger

Source finding: `harness-post-implementation-review.md` M2 ("Planned reveal metadata and the actual
knowledge ledger can disagree") + §18 row 9.

What changed:

`CatalogService.render`'s CANON FACTS line labeled any fact with a non-null `revealChapter` as
`(revealed ch X)` — present tense, for what is only a schedule hint — regardless of whether anyone had
actually learned it per `character_knowledge`, the system's real reveal authority (`loadKnowledgeView`
reads that ledger, never `revealChapter`). A fact scheduled for chapter 20 showed as already revealed
while outlining chapter 5, making the outliner skip authoring a `knowledgeContract` reveal for it —
the intended reveal then never gets staged and never reaches the ledger.

`render` now queries `character_knowledge` for the project and labels a fact `(revealed)` only when a
ledger row actually exists for it — no chapter parameter needed, since a ledger row (written only at
draft approval, per `applyBriefReveals` in `knowledge-view.ts`) can only ever exist for an
already-approved, i.e. past, chapter. Otherwise the fact is `(unrevealed)`, with `revealChapter` — if
set — appended as an explicit `scheduled ch X` hint rather than driving the "revealed" claim itself.

Tests: `tests/generation/knowledge-contract.spec.ts` — updated the existing fixture assertion that
pinned the buggy behavior (a `revealChapter`-only fact now asserts `(unrevealed; scheduled ch 4)`, not
`(revealed ch 4)`); added 3 new cases: a fact with both `revealChapter` and a ledger row renders
`(revealed)` (ledger, not the schedule hint, drives the label); a fact with neither renders plain
`(unrevealed)`; a fact with a ledger row but no `revealChapter` renders `(revealed)` with no schedule
hint.

Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all green,
1009 pass, 10 skip, 0 fail (independently re-run).

Commit: `9cc74caf`

### FIX-10 — `briefCompliance` fails closed when the judge omits it

Source finding: `harness-post-implementation-review.md` M1 ("Brief fulfilment fails open when the
judge omits the required field") + §18 row 9 (medium).

What changed:

`chapter-generation.graph.ts`'s `judge()` asks the model to include `briefCompliance` in every
response ("include briefCompliance in your JSON"), but previously defaulted a missing field to
`compliant: true` — silently accepting exactly the malformed-but-schema-valid output the anti-filler
check exists to catch. The fallback now defaults to `false` (fail closed), with a synthetic soft
finding (`'brief: judge omitted briefCompliance — treated as non-compliant'`) so the repair
ladder/human reviewer has something concrete to act on.

**Decision made in this pass, not the audit's literal file list**: `JudgeSchema.briefCompliance`
stays optional rather than becoming schema-required. Making it schema-required would fail parsing
(triggering the existing retry → `evaluation_failed` → human-review path) for `GenerationService
.judgeDraft` too — a separate manual endpoint (`POST /drafts/:n/judge`) sharing `JudgeSchema` but
whose human message never includes a `## BRIEF` block or asks for `briefCompliance`, and which never
reads or gates on a `briefCompliant` flag at all. A schema-level fix would have permanently broken
that endpoint's every call. The application-level fallback flip is scoped exactly to the one place
(`chapter-generation.graph.ts`'s judge, feeding `routeAfterJudge`'s accept gate) that actually asks
for and depends on this field.

Tests: `tests/ai/brief-fulfillment-graph.spec.ts` — the existing test that pinned the buggy
fail-open behavior is renamed and its assertions flipped (`briefCompliant: false`, `outcome:
'awaiting_review'`, `judgeNote` contains the synthetic finding); new test confirms the `autoFix: true`
variant routes into the repair ladder (`accepted_with_findings`). Four unrelated spec files
(`checkpoint-resume`, `judge-fail-closed`, `mechanical-check-graph`, `repair-ladder`) had judge-reply
mocks that omitted `briefCompliance` while asserting on unrelated behavior (checkpoint resume, retry
parsing, mechanical checks, finding-dedup) — each now supplies `briefCompliance: { compliant: true,
issues: [] }` so those tests isolate what they're actually verifying instead of incidentally tripping
the new gate.

Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all green,
1010 pass, 10 skip, 0 fail (independently re-run).

Commit: `b487e862`

### FIX-11 — Use one writing-style policy across generation, fix, and revision prompts

Source finding: `harness-post-implementation-review.md` M3 ("Automated repair and revision reintroduce
old style pressure") + §18 row 11 (the last required fix).

What changed:

`fix.prompt.ts` and `revision.prompt.ts` both prepended the old, full `AUTHORING_STYLE` house style
into their system messages — the version a prior P0 pass (D30) deliberately moved away from for
`generation.prompt.ts` (it contains flatly contradictory instructions: never state emotion directly,
mandatory sensory grounding, every ending must compel a page turn — vs. `DEFAULT_WRITING_INSTRUCTIONS`'s
brief-emotion-allowed, selective-detail, earned-closure stance). Both prompts already receive the
current, editable `writing_style` section via their `{contextPack}` human-message var (same as
`generation.prompt.ts`), so a clean first draft followed the approved style while an automated repair
or human-requested revision received the conflicting old style as a higher-priority system instruction.

Both files now import `AUTHORING_STYLE_PLANNING` (the trimmed POV/canon-consistency subset with no
craft-rule conflicts) instead of the full `AUTHORING_STYLE` — preserving the still-useful, non-conflicting
guidance (third-person-limited, character-voice consistency, canon-wins-over-drama) while removing the
craft-rule contradiction. Versions bumped (`fix` 1.1.0→1.2.0, `revision` 1.0.0→1.1.0). The stale comment
above `AUTHORING_STYLE_PLANNING`'s definition — which claimed `fix`/`revision`/`reforge-write`/
`rebrand-convert` all "keep the full version" (already false for `generation.prompt.ts`, which uses
neither constant) — was corrected to accurately describe every current importer.

**Scope boundary, deliberate**: `reforge-write.prompt.ts`, `reforge-transform-write.prompt.ts`, and
`rebrand-convert.prompt.ts` still use the full `AUTHORING_STYLE`, left untouched — they belong to
separate re-authoring pipelines (`docs/reforge-pipeline-design.md`/`docs/rebrand-pipeline-design.md`)
the audit's M3 finding and required-fix wording never named.

Tests: `tests/ai/prompts.spec.ts` (+1): `fixPrompt.system`/`revisionPrompt.system` no longer contain
the old style's conflicting bullets ("never state emotion directly", "compels turning the page",
"Ground every scene with concrete sensory detail") and still contain the non-conflicting
"Canon always wins over dramatic convenience" guidance.

Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all green,
1011 pass, 10 skip, 0 fail (independently re-run).

Commit: (recorded after commit, see git log)

### FIX-12 — Cursor-only finalization retry no longer re-extracts/reapplies continuity

Source finding: `harness-targeted-fixes-verification.md` C1 residual gap ("A second logical run
re-extracts continuity via a fresh LLM call and reapplies a potentially different delta after a
cursor-only failure").

Root cause: FIX-01 made the finalization graph resumable by re-running the whole node chain
(`guard → commitProse → extractContinuity → applyContinuity → updateIndexes → advanceCursor → finish`)
from `START` on retry, relying on every node already being idempotent. `applyContinuity` correctly
no-ops when handed a falsy `continuityDelta`, but `extractContinuity` itself was not idempotent — it
called the LLM and unconditionally overwrote the `continuity_proposals` row via `onConflictDoUpdate`
on every invocation, with no check of whether continuity for that chapter had already durably landed.
So a retry after `continuityApplied=true` but a failed cursor write called the extraction LLM again,
and because extraction is model output, the second delta need not equal the first — creating a second,
possibly contradictory continuity mutation on top of the first.

What changed: `extractContinuity` (`chapter-finalization.graph.ts`) now reads
`chapters.continuityApplied` for `(projectId, chapter)` immediately after the existing grok early-return,
before calling `modelRouter.structured` or touching `continuityProposals`. If already `true`, it returns
`{ continuityDelta: null, nodeTrace: ['extractContinuity'] }` — the same shape as the grok skip — so
`applyContinuity`'s existing falsy-delta guard carries the resume straight through to `updateIndexes`/
`advanceCursor` with no LLM call and no proposal overwrite. No other node, edge, state field, table, or
migration changed — the durable `continuityApplied` flag already written by `applyContinuity` was the
correct resume marker; it was just never read by `extractContinuity`.

Tests: `tests/ai/finalization-resume.spec.ts` (+1: `should not re-extract or reapply continuity when
resuming after continuityApplied=true but cursor advancement failed`). Seeds a chapter through a first
graph run that completes `applyContinuity` (`continuityApplied=true`, proposal = delta A) then fails at
`advanceCursor` (a `db.update` proxy trap simulates the cursor-write failure); re-invokes the graph with
a stub that would return a different delta B on a second extraction call; asserts the extraction stub
was called exactly once total, `continuity_proposals` still holds delta A unchanged, no entity from
delta B was created, and the cursor still advances correctly on the resumed run. Confirmed against
pre-fix code (guard temporarily disabled): the test fails on `expect(calls).toBe(1)` (2 calls observed).
Passes after the fix.

Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all green,
1012 pass, 10 skip, 0 fail (independently re-run).

Commit: `3e7ac933`

### FIX-13 — Ancestor draft edits invalidate drafted descendants

Source finding: `harness-targeted-fixes-verification.md` H4 residual gap ("`updateDraft`, `importDraft`,
and `reviseDraft` still mutate chapter N without checking for or invalidating drafts N+1 and later. A
later approved draft can therefore remain based on prose that no longer exists").

Root cause: FIX-05 protected already-drafted chapters from being silently overwritten by arc
reconciliation, but that is a different write path from `updateDraft`/`importDraft`/`reviseDraft` — the
three human/AI-revision entry points that directly mutate a single chapter's draft row. None of the
three looked past their own chapter. A descendant draft (e.g. chapter N+1, generated using chapter N's
prose tail and continuation state as its predecessor context) had no mechanism to be told its ancestor
had since changed, and could sail through `approveDraft` → `finalize` unchanged.

What changed: added a nullable `drafts.staleReason` column (mirrors the existing `briefs.staleReason`
pattern exactly). A new private `GenerationService.markDescendantDraftsStale(projectId, chapter,
reason)` runs at the end of `updateDraft`/`importDraft`/`reviseDraft`: it sets `staleReason` on every
OTHER draft in the project with `chapter > N` and `status <> 'final'` (finalized chapters are never
touched — out of scope per the audit's own instruction not to auto-invalidate finalized history), then
separately downgrades `reviewStatus` from `approved` back to `needs_review` only for descendants that
were actually approved — a descendant already sitting in `needs_review`/`contradiction`/`generating` is
left as-is, just flagged. `approveDraft` now refuses a stale draft outright (`DRF_007`, new error code)
so a human can't re-approve a still-stale draft without regenerating it first — no new gate was needed
at `finalize()` itself since it already requires `reviewStatus === 'approved'`. Regenerating a chapter
(`persistDraft` in the generation graph, and `generateGrok`) explicitly writes `staleReason: null`,
clearing the flag on fresh content. The three mutation methods also clear `staleReason` on their own
chapter's row (a freshly hand-edited/imported/revised draft is not itself stale).

Tests: `tests/generation/draft-mutation-guards.spec.ts` (+7, new `describe('descendant invalidation')`
block): `updateDraft`/`importDraft`/`reviseDraft` each mark an approved descendant stale and downgrade it
to `needs_review`; `approveDraft` rejects a stale draft with `DRF_007`; ancestors and other projects'
drafts are left untouched; a descendant already in `contradiction` keeps that status while still getting
flagged; a `final` descendant is never touched at all. Confirmed against pre-fix code (invalidation
calls and the `DRF_007` guard temporarily removed): 5 of the 7 new tests fail; the two negative-only
tests (unaffected drafts, final descendant) were separately confirmed to catch over-broad invalidation
by widening the predicate to `chapter <> N` and observing them fail. All pass with the fix restored.

Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all green,
1019 pass, 10 skip, 0 fail (independently re-run).

Non-blocking note carried forward: `markDescendantDraftsStale` runs after the ancestor's own write and
is not wrapped in the same transaction as it (matching the existing non-transactional shape of
`updateDraft`/`importDraft`/`reviseDraft`, which also write `draftRevisions` non-transactionally today).
A crash between the ancestor write and the descendant-marking update would leave descendants un-flagged.
Tightening this would mean adding transactional wrapping to methods that don't have it today, which is a
broader change than this targeted fix's scope — left as a known limitation, not a fix-blocking gap.

Commit: `868402b6`

### FIX-14 — Low-confidence continuity entries stay reachable for review

Source finding: `harness-targeted-fixes-verification.md` H5 residual gap ("`applyContinuityDelta`
silently skips low-confidence rows, then `applyContinuity` marks the encompassing proposal `applied`.
Since `getContinuityProposal` requires `status='pending'`, the normal review/update/apply endpoints
cannot retrieve those held rows. They are retained only as inaccessible historical JSON, not staged
review work").

Root cause: `applyContinuityDelta` (`apply-continuity.ts`, already correct since FIX-06) skips writing
`threads`/`mysteries`/`relationships`/`characterStates` entries marked `confidence: 'low'` to their
durable tables. But both places that call it —
`chapter-finalization.graph.ts`'s `applyContinuity` node and `GenerationService.applyContinuityProposal`
— unconditionally flipped `continuity_proposals.status` to `'applied'` in the same transaction
regardless of whether anything was held back. `getContinuityProposal`, `getReviewQueue`,
`updateContinuityProposal`, and `discardContinuityProposal` all filter on `status = 'pending'`, so once
status flipped, a proposal that held entries back became permanently unreachable through every normal
review path — the raw JSON survived in the `proposal` column, but no endpoint could find it.

What changed: a new exported pure helper, `continuityHasHeldEntries(delta)` in `apply-continuity.ts`,
checks the four confidence-bearing arrays (`threads`, `mysteries`, `relationships`, `characterStates` —
not `newEntities`/`timeline`/`power`/`knowledgeChanges`/`appeared`, which carry no confidence field) for
any `confidence === 'low'` entry. Both apply sites now call it once before their transaction's proposal
update: when it returns `true`, the proposal's `status`/`appliedAt` are left untouched (still `pending`,
still `null`) — everything else (`applyContinuityDelta` itself, `chapters.continuityApplied = true`)
proceeds exactly as before, unconditionally. Only when nothing was held back does the proposal flip to
`applied`. This means a chapter can now be fully finalized (`continuityApplied = true`, cursor advanced,
high-confidence canon durably written) while its continuity proposal stays `pending` — the intended
state for "landed what we trusted, held back what we didn't." Re-applying that still-pending proposal
later (e.g. after a human edits it via `updateContinuityProposal` to remove/upgrade the held entries) is
safe and idempotent, unchanged from before — `applyContinuityDelta`'s upserts already guaranteed that.
No new `continuity_proposal_status` enum value, no new schema, no migration — the existing
`pending`/`applied`/`discarded` states were already sufficient; this fix is about _when_ status flips to
`applied`, not about adding new states. `chapters.continuityApplied`/FIX-01's resume-idempotency gate is
untouched and stays orthogonal to this review-reachability concern.

Tests: `tests/ai/continuity-apply.spec.ts` (+4): a mixed-confidence delta through the finalization graph
lands the high-confidence thread, skips the low-confidence thread and character state, sets
`continuityApplied = true`, and leaves the proposal `pending`/reachable via `getContinuityProposal`; an
all-high-confidence delta still flips to `applied` (regression guard against over-broadening the
condition); the manual `applyContinuityProposal` endpoint leaves a held-entry proposal `pending` and
visible in `getReviewQueue().proposals`; editing a held entry's confidence to `high` via
`updateContinuityProposal` and re-calling `applyContinuityProposal` lands it and flips the proposal to
`applied`. Confirmed against pre-fix code (conditional reverted to always `'applied'`): 3 of the 4 new
tests fail (the all-high-confidence regression guard correctly still passes, proving it isolates the
right behavior). All pass with the fix restored.

Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all green,
1023 pass, 10 skip, 0 fail (independently re-run).

Commit: `a6fbe27e`

### FIX-15 — Character-state merge replaces, not COALESCE-merges, stale fields

Source finding: `harness-targeted-fixes-verification.md` H1 residual gap ("The prompt says a reported
state replaces the old state and should contain only what is now true, but `COALESCE(EXCLUDED.field,
old.field)` turns it into a partial merge... stale state is now repeatedly fed back to generation" —
elevated to a live-context defect once FIX-03 wired `character_states` into `forChapter`).

Root cause: the continuity extraction prompt (`continuity.prompt.ts`) is explicit that each reported
character state is a full replacement snapshot — "Each state you report replaces the prior recorded
state for that character — it is not merged or appended, so state only what is now true." But
`applyContinuityDelta`'s `characterStates` upsert (`apply-continuity.ts`) wrote
`COALESCE(EXCLUDED.field, character_states.field)` per field on conflict. Since the insert `.values()`
already turns an omitted field into `null` (`characterState.location ?? null`), `EXCLUDED.field` was
`null` whenever the model didn't restate a field, and `COALESCE(null, old.field)` fell back to the OLD
value instead of clearing it — a healed injury, an abandoned goal, or a resolved status note persisted
forever and, since FIX-03, was repeatedly re-fed into later chapter generation as current fact.

What changed: the `onConflictDoUpdate.set` for `characterStates` now writes the extracted values
directly (`characterState.location ?? null`, etc.) instead of `COALESCE`-ing against the prior row —
a genuine full-snapshot overwrite, matching the prompt's documented contract exactly. `threads`,
`mysteries`, and `relationships` in the same file were deliberately left untouched — their `COALESCE`
usage is semantically correct for those tables (e.g. a thread status update legitimately preserves an
unrelated summary the model didn't restate); only the character-state prompt establishes a "full
replacement snapshot" contract. `renderCharacterState` (`context-assembler.service.ts`) needed no
change — it already omits any null/empty field from the rendered block, so once the DB stopped
carrying stale values, rendering became correct automatically.

Tests: `tests/ai/continuity-apply.spec.ts` — corrected the one existing test that had locked in the
bug (renamed to "should replace the whole character state snapshot, clearing fields omitted by a later
chapter"; its final assertion changed from asserting `conditions`/`immediateGoal`/`statusNote` survived
unchanged to asserting they are `null` after an update that omits them); added 3 new cases: a resolved
injury clears `conditions` on a later location-only update, an abandoned goal clears on a later
status-note-only update, and a complete new snapshot fully overwrites a complete prior one (every field
matches the new values, none of the old ones survive — guards against an over-broad fix that clears
unconditionally). `tests/ai/context-assembler.spec.ts` — one new test seeding a `character_states` row
with cleared fields (`conditions: null, immediateGoal: null`) alongside set ones and asserting the
rendered `character_state` section shows only the current fields, with no stale mention of the cleared
value anywhere in the pack. Confirmed against pre-fix (`COALESCE`) code: the corrected existing test and
both clearing tests fail with the stale values still present (16 pass / 3 fail in the file); the
full-overwrite and rendering tests pass in both states (guard tests, not bug-reproducers, since
`COALESCE` happens to pick `EXCLUDED` when every field is non-null and the renderer was already
correct). All pass with the fix restored.

Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all green,
1027 pass, 10 skip, 0 fail (independently re-run).

Commit: `b765de21`
