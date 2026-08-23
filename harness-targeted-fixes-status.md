# Harness Targeted Fixes Status

Source: `harness-post-implementation-review.md` (verdict: NEEDS TARGETED FIXES), §18 "Required Fixes
Before Evaluation", cross-checked against `harness-final-recommendation.md` for architectural
alignment. Scope is corrective only — no new subsystems, no re-litigating P0/P1 architecture.

## Summary

- Completed: 7
- In Progress: 0
- Pending: 4
- Blocked: 0

## Tasks

| ID     | Severity | Task                                                                                                                                | Status    | Dependencies |
| ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------ |
| FIX-01 | CRITICAL | Make chapter finalization recoverable/idempotent across prose commit → extraction → apply → cursor                                  | COMPLETED | —            |
| FIX-02 | CRITICAL | Reject mutation/deletion of finalized drafts; fix cross-table renumbering invariant on delete                                       | COMPLETED | —            |
| FIX-03 | HIGH     | Read `character_states` + current relationships into `forChapter`; validate entity keys before applying extraction                  | COMPLETED | —            |
| FIX-04 | HIGH     | Render `brief.pov` into generation/judge brief; guarantee POV entity card priority                                                  | COMPLETED | —            |
| FIX-05 | HIGH     | Arc reconciliation observes events inside the current arc, not `arc.chapterStart`; protect/invalidate already-drafted descendants   | COMPLETED | FIX-02       |
| FIX-06 | HIGH     | Continuity extraction receives existing key vocabulary; validate relationship targets/evidence; route ambiguous mutations to review | COMPLETED | —            |
| FIX-07 | HIGH     | Bible stage output instructions match schema; persist stage atomically; fix `bible_doc` ref format mismatch                         | COMPLETED | —            |
| FIX-08 | HIGH     | Gate/cap the legacy whole-book `outline()` endpoint so it cannot overwrite protected arc briefs                                     | PENDING   | —            |
| FIX-09 | MEDIUM   | Align `revealChapter` catalog semantics with the actual knowledge ledger                                                            | PENDING   | —            |
| FIX-10 | MEDIUM   | Require `briefCompliance` at runtime; fail closed if the judge omits it                                                             | PENDING   | —            |
| FIX-11 | MEDIUM   | Use one writing-style policy across generation, fix, and revision prompts                                                           | PENDING   | —            |

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

See table above. FIX-08 selected next.

## Blocked

None.

## Completed

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

Commit: (recorded after commit, see git log)
