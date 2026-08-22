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

- Completed: 13
- In Progress: 0
- Pending: 2
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
| P1-04 | P1       | Volume planner (`plan()`) reads relevant bible documents, behind a rebuild flag                                                     | COMPLETED | P1-01, P1-02, P1-03                         |
| P1-05 | P1       | Extend `ContinuitySchema` with `characterStates`/`knowledgeChanges` fields                                                          | COMPLETED | —                                           |
| P1-06 | P1       | New `character_states` table (schema + migration)                                                                                   | COMPLETED | —                                           |
| P1-07 | P1       | Finalization applies ALL extracted continuity fields transactionally; fixes `continuityApplied` dead-end (D7)                       | COMPLETED | P1-05, P1-06                                |
| P1-08 | P1       | Retire source-extraction overlap; drop or explicitly mark unused `timeline_events`/`power_progressions`                             | COMPLETED | P1-07                                       |
| P1-09 | P1       | Route `outlineArc` through `forOutline()`; deprecate/cap whole-book `outline()`                                                     | COMPLETED | —                                           |
| P1-10 | P1       | Reconciliation trigger every k finalized chapters (default 5, configurable) or on staleness                                         | COMPLETED | P1-09                                       |
| P1-11 | P1       | Volume-completion epitome write (or explicitly drop the `volumes.epitome` column)                                                   | COMPLETED | —                                           |
| P1-12 | P1       | Outliner authors `knowledgeContract`; persist `pov`; wire mystery `truthFactKey`                                                    | COMPLETED | —                                           |
| P1-13 | P1       | Prompt-cache the generation path: `asStable` sections, `cacheStrategy`, fix rebrand/reforge stable-var bug                          | COMPLETED | —                                           |
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
- What changed: `plan()` now fetches all of a project's `bible_documents` in parallel with the
  existing project lookup (`Promise.all`, no added latency), renders each as
  `${section}/${slug}:\n${body}` capped at 1,500 tokens per doc via `truncateAtParagraph` (bounded
  even across all six bible stages, substantially richer than `premisePack`'s 5-line audit-purpose
  teaser since this task's point is giving the planner real content), and passes it as a new
  `bibleDocs` template var. Falls back to the literal `'(no bible written yet)'` placeholder for a
  project with no bible yet, mirroring the existing `skeleton` fallback pattern exactly. The prompt
  (bumped `1.1.0` → `1.2.0`) now instructs the model to treat the bible as canon reference — never
  restated verbatim — and authoritative over the skeleton on conflicts (later-stage, more specific
  content), unless the disagreement looks like an unintended inconsistency. Confirmed the
  bible-builder's own stage order (`foundation → worldAndPower → factionsAndLocations → characters
→ plot → volumes → indexLore`) means including the `volumes` stage's prose sketch is not
  circular — it runs before `plan()` in the normal flow. No new "rebuild flag" was added — unlike
  P1-01/P1-02's write paths, this is a read-only enhancement with no clobber risk, so it always
  applies when bible docs exist and degrades cleanly to the placeholder when they don't.
- Tests: `tests/generation/plan-bible-docs.spec.ts` (new) — bible-doc content reaches the model call
  when docs exist; the explicit placeholder is used and `plan()` still succeeds when none exist; an
  oversized single document is actually capped rather than concatenated unbounded.
- Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all
  green (641 pass, 10 skip, 0 fail) after I fixed a type-check error the sub-agent's own verify pass
  missed (bare `mock.calls[0]?.[1]` indexing doesn't type-narrow cleanly against a zero-length tuple
  inference — fixed by destructuring the whole call tuple with a single `as unknown as [...]` cast,
  matching the existing precedent in `tests/ai/prompt-caching.spec.ts`). Confirmed no api-types
  drift (`plan()`'s request/response DTOs are unchanged; only the internal prompt-input var changed).
- Commit: c3f4cabe

### P1-05 — Extend `ContinuitySchema`

- Affected area: `src/modules/ai/schemas/continuity.schema.ts` (or wherever the schema lives).
- Acceptance criteria:
  - Adds `characterStates: Array<{ entityKey, location?, conditions?, immediateGoal?, statusNote?, evidence }>`
    and `knowledgeChanges: Array<{ entityKey, factKey, how }>` per §6 of the recommendation doc.
  - `relationships` is already extracted today — no schema change needed there, only application
    (P1-07).
  - Prompt instructs "extract only what the prose establishes, with an evidence excerpt; empty
    arrays are correct."
- What changed: `continuity.schema.ts` gained `ContinuityCharacterState` (`entityKey` required;
  `location`/`conditions: string[]`/`immediateGoal`/`statusNote` all optional; `evidence` required —
  the only non-optional field beyond `entityKey`, matching the recommendation doc's exact shape) and
  `ContinuityKnowledgeChange` (`entityKey`/`factKey`/`how`, all required). `ContinuitySchema` gained
  `characterStates`/`knowledgeChanges` as required (non-optional) array fields, matching the existing
  convention every other extraction array in this schema already uses (`threads`, `mysteries`,
  `timeline`, `relationships`, `power`) — the model must emit `[]`, not omit the field, when there's
  nothing to report. `continuity.prompt.ts` (bumped `1.0.0` → `1.1.0`) now instructs the model to
  extract character states (explicitly "replaces, not merges" the prior state — sets up how P1-07
  will later apply it) and knowledge changes, plus the recommendation doc's verbatim-in-spirit
  instruction: "extract only what the prose establishes, with an evidence excerpt; empty arrays are
  correct." Confirmed `chapter-finalization.graph.ts`'s `extractContinuity` needed zero changes — it
  persists the whole `delta` object as an opaque jsonb blob with no field-level destructuring, so the
  richer payload flows through unchanged. This task is schema-and-prompt only; `character_states`
  (P1-06) and the transactional apply (P1-07) are separate, not-yet-started tasks.
- Tests: `tests/ai/prompts.spec.ts` — new `ContinuitySchema (P1-05 characterStates/knowledgeChanges)`
  describe block: parses a populated payload; rejects a `characterStates` entry missing `evidence`;
  accepts empty arrays for both new fields; rejects a payload omitting either new field (regression
  guard matching the required-array convention).
- Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all
  green (645 pass, 10 skip, 0 fail). Confirmed no api-types drift (`ContinuitySchema` is purely
  internal to the LLM extraction call, never exposed via HTTP — the web-facing continuity-proposal
  DTOs are a separate, untyped-jsonb surface).
- Commit: 0211cffb

### P1-06 — New `character_states` table

- Affected area: `src/database/schemas/*.ts`, migration.
- Acceptance criteria:
  - New table per §6: `projectId`, `entityKey`, `location`, `conditions: string[]`, `immediateGoal`,
    `statusNote` (one line, replaced not appended each update), `lastUpdatedChapter`.
  - Additive migration only.
- What changed: added `characterStates` to `src/database/schemas/knowledge.ts` (the home for the
  rest of the knowledge/canon domain — `entities`, `canonFacts`, `characterKnowledge`), mirroring
  `canonFacts`'s exact conventions: `entityKey` is a plain `varchar` (not a FK to `entities.id`,
  matching `entityRelationships.targetKey`'s established pattern for AI-extraction-sourced entity
  references), `immediateGoal`/`statusNote` use `text` (this file's convention for free-text/
  sentence-length fields vs `varchar` for short/enum-like strings), `conditions` is
  `jsonb('conditions').$type<string[]>()` matching `canonFacts.subjects`/`canonFacts.terms` exactly,
  and a single unique constraint on `(projectId, entityKey)` — one current-state row per character,
  no separate index needed since the constraint already backs one (matching `canonFacts`'s
  precedent). Added `Knowledge.CharacterState` to the namespace block and a simple
  `characterStatesRelations` (`project` only, no back-reference needed yet). Migration
  `0005_purple_major_mapleleaf.sql` is a single additive `CREATE TABLE` + its one FK constraint — no
  other tables/columns touched. Nothing reads or writes this table yet — that's P1-07.
- Tests: `tests/knowledge/character-states-schema.spec.ts` (new) — insert/round-trip; the unique
  constraint rejects a duplicate `(projectId, entityKey)`; an `onConflictDoUpdate` upsert replaces
  `statusNote` rather than appending; cascade delete removes state rows when the parent project is
  deleted.
- Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all
  green (649 pass, 10 skip, 0 fail). Confirmed no api-types drift (pure schema, no DTO/controller
  surface).
- Commit: c4f59128

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
- What changed: the two independent apply paths (`chapter-finalization.graph.ts`'s automatic
  `applyContinuity` node and `generation.service.ts`'s manual `applyContinuityProposal` endpoint)
  had already drifted from each other while both discarded `relationships`/`characterStates`/
  `knowledgeChanges` entirely. Extracted a single shared `applyContinuityDelta` (new
  `src/modules/ai/graphs/apply-continuity.ts`) both now call inside their existing transactions.
  Reconciling the drift surfaced three real bugs beyond the task's stated scope: entity-appearance
  rows only got `firstChapter` from the service path (`lastChapter` stayed null — kept the graph's
  full-bounds version); `plotThreads`/`mysteries` only set `closedChapter`/`resolvedChapter` on
  _update_, so a thread first extracted already-closed landed with a permanently null close chapter
  (now set on insert too); and the mystery upsert's `COALESCE(EXCLUDED.question, ...)` compared
  against `''` (the insert default), never actual `NULL`, so it was a silent no-op that blanked an
  existing question whenever a later extraction omitted it (fixed with `NULLIF(EXCLUDED.question,
'')`). Added `relationships` → `entity_relationships` (entityKey resolved to id via a memoized
  lookup shared with `appeared`, unresolvable keys logged and skipped, never fatal) and
  `characterStates` → `character_states` (per-field `COALESCE`, matching the P1-01/P1-02 precedent —
  an omitted field isn't nulled out). The graph's `applyContinuity` now also sets
  `chapters.continuityApplied = true` in the same transaction as the D7 fix — the direct cause of
  the dead-end (the manual endpoint's `pending`-only guard was never reachable for graph-finalized
  chapters because the graph had already flipped the proposal to `'applied'` first).
  - **Deviation from the literal doc text, deliberate and documented:** `knowledgeChanges` is
    written NOWHERE. `character_knowledge` carries a hard, pre-existing invariant — "populated
    deterministically from brief `learns` declarations at draft approval, never by AI extraction"
    (`docs/character-knowledge-design.md` §4, also stated directly on the table's schema comment)
    — because it's the single source of truth the deterministic knowledge-leak scanner and the
    judge's forbidden-knowledge gate trust to decide what a character may safely reference. Auto-
    applying an LLM's `knowledgeChanges` extraction (especially via the fully-automatic, unreviewed
    graph path) risks a hallucinated or over-eager reveal silently marking a still-hidden fact as
    "known," defeating the leak scanner for every subsequent chapter — the false-negative mirror of
    the exact failure class this project's epistemic-ledger work exists to prevent. This satisfies
    the recommendation doc's own general principle — "low-confidence extractor output routes
    through the existing proposal-review flow instead of auto-applying" — more literally than
    writing it would have: the raw `knowledgeChanges` array is already visible on the persisted
    `continuity_proposals.proposal`, so a human reviewing it can act via the existing manual
    fact-reveal endpoint (`POST /:factKey/reveal`) if they agree. No new endpoint/UI was built. The
    reasoning is documented as a code comment at the point in `applyContinuityDelta` where the
    handling would otherwise go, alongside the (unchanged, always-true) note that `timeline`/`power`
    stay unpersisted per §6 of the recommendation doc.
- Tests: `tests/ai/continuity-apply.spec.ts` (new) — the graph path sets `continuityApplied` (direct
  D7 regression test); `relationships` persist from both apply paths, with unresolvable entity keys
  skipped; `characterStates` upsert with COALESCE-preserve-on-omission verified across two chapters;
  `knowledgeChanges` produce zero `character_knowledge` rows from either path (positive regression
  guard for the deliberate exclusion); `timeline`/`power` still produce no writes anywhere; the
  manual endpoint still works end-to-end for an edited pending proposal (confirms the shared-function
  refactor didn't break its existing gate/behavior).
- Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all
  green (656 pass, 10 skip, 0 fail). Confirmed no api-types drift (internal application logic only,
  no DTO/controller shape changed).
- Commit: d965c78f

### P1-08 — Retire dead extraction paths

- Affected area: `entity_relationships` writer wiring, `timeline_events`/`power_progressions` tables.
- Acceptance criteria:
  - The separate source-extraction graph (currently unreachable — its consolidation service's
    upstream writer is never injected) is retired or repointed now that P1-07 covers relationship
    application through the mainline finalization path.
  - `timeline_events`/`power_progressions` (zero writers, grep-verified) are dropped with this P1
    migration, or left with an explicit "unused" note if a live project turns out to depend on them
    — do not wire them speculatively per the recommendation doc's explicit rejection.
- What changed: the original framing (this task's own acceptance criteria above, inherited from the
  recommendation doc) turned out to be stale — the source-extraction _graph_
  (`source-extraction.graph.ts`) is actually live today, reached via the `/extract` endpoint fixed
  in an earlier P0 task; it does its own raw upserts and was never part of the overlap. The
  genuinely dead code was a _different_, self-described "simpler alternative to the LangGraph
  source-extraction graph": `ExtractionService.extractChapter`/`.extractBatch`, which nothing
  outside `src/modules/extraction/` ever called, and `KnowledgeRepository`, used only by that dead
  method. Both deleted; `ExtractionService` keeps `resolvePendingChapters`/`DEFAULT_EXTRACT_LIMIT`
  (both live), its constructor pruned to just the database client, and `extraction.module.ts`'s now
  -unnecessary `AiModule` import removed (neither remaining class needs it).
  - **A first pass at this task was correctly blocked by a sub-agent** before any edits landed: my
    own initial investigation wrongly concluded `ConsolidateService` was also dead. It is not —
    it's injected into `PipelineController` and served live at `POST
/api/v1/projects/:projectId/consolidate`, consumed by a real "Consolidate" button in
    `novel-forge-web`'s source-pipeline screen. I re-verified this myself, corrected the task scope,
    and re-delegated — `consolidate.service.ts`, its endpoint, and all of `novel-forge-web` were
    left completely untouched on the second, corrected pass.
  - **A real, pre-existing gap surfaced, not fixed (out of scope):** `ConsolidateService`'s
    `promoteRelationships()` half reads `relationship_observations`, which was written only by the
    now-deleted `KnowledgeRepository.addRelationshipObservation` — itself called only by the
    already-dead `extractChapter`. That table was already permanently empty in the live system
    before this task (since `extractChapter` had zero callers even before this cleanup), so this
    doesn't newly break the Consolidate feature — but it means the relationship-promotion half of
    that live endpoint has never actually promoted anything. Worth a future look if that behavior is
    expected to do something; not addressed here.
  - `timeline_events`/`power_progressions` dropped via a clean, additive-only-in-reverse migration
    (`DROP TABLE power_progressions CASCADE; DROP TABLE timeline_events CASCADE;` — nothing else
    touched, verified table count 48 → 46). `relationship_observations` was left alone (not in the
    recommendation doc's explicit drop list).
- Tests: deleted `tests/knowledge/knowledge.spec.ts` (tested the now-deleted `KnowledgeRepository`
  exclusively); removed one test in `tests/ai/continuity-apply.spec.ts` that asserted no rows land
  in the now-dropped `timeline_events`/`power_progressions` tables (the assertion itself became
  meaningless once the tables no longer exist, not a coverage loss). One sub-agent self-caught and
  corrected an `rm -rf tests/knowledge` mistake that would have wrongly deleted four unrelated,
  still-valid test files in that directory — restored via `git checkout --` before finishing, and
  I independently confirmed all four are present and unmodified before committing.
- Validation: `bun scripts/verify.ts apps/novel-forge-server` — format/lint/type-check/test all
  green (649 pass, 10 skip, 0 fail). Confirmed `apps/novel-forge-web` has zero diff and no api-types
  reference the deleted classes/tables.
- Commit: bf07bd62

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

**What changed:**

- `outline()` (whole-book) now derives its span from the volumes' chapter ranges when `count` is
  omitted, then clamps to a new `MAX_WHOLE_BOOK_OUTLINE_SPAN = 25` — applied whether the span came
  from that derivation or from an oversized explicit `body.count` — logging a warning when clamped.
  Whole-book `outline()` stays the legacy planning path; `outlineArc` (gated on approved arcs) is the
  intended production path per the planning hierarchy — the cap just stops an omitted/oversized
  `count` from silently planning the entire unwritten novel in one model call.
- `outlineArc()` is rewired onto `ContextAssembler.forOutline(projectId, arc.chapterStart)` — the
  same pack the `/context/preview` debug endpoint already used — so the arc outline call now carries
  recent finalized-chapter summaries, retrieval, and the volume-objective section. The hand-built
  `volumePlan` text dropped its own redundant `## Volume: ...` block since `forOutline`'s
  `volume_objective` section now covers it; the arc-specific block (objective/escalation/payoff/hook)
  and next-arc-intent chaining are unchanged.

**Tests:**

- `tests/generation/outline-invariants.spec.ts`: 3 new cases via a `buildSpanService()` helper —
  clamp-on-omitted-count, clamp-on-oversized-explicit-count, no-clamp-when-under-cap.
- `tests/bible/arc.spec.ts`: extended the existing arc-outline test to assert the `catalog` prompt
  var carries the `forOutline` volume-objective text, plus a new test asserting a finalized chapter's
  summary text reaches the arc outline call through `catalog`.

**Validation:** `bun scripts/verify.ts apps/novel-forge-server` — 653 pass, 0 fail, 10 skip.

**Commit:** `118e8fb5`

### P1-10 — Reconciliation trigger

- Affected area: finalization graph / a new trigger hook, config.
- Acceptance criteria:
  - After every k finalized chapters (default 5) or on refinement staleness, remaining chapters of
    the _current_ arc are re-outlined (not the whole book).
  - Cadence is a config knob, not a hardcoded constant — the recommendation doc calls the default a
    guess to be tuned against usage.
  - Gated on hand-edit markers so a human's manual brief edits aren't silently clobbered by
    reconciliation.

**What changed:**

- Added `briefs.handEdited` (boolean, default `false`, migration `0007_special_agent_brand.sql`).
  Set `true` by both human-edit write paths — `GenerationService.updateBrief` (the manual-edit
  endpoint) and `ProposalApplyService`'s `applyBriefUpdate` (the refinement `brief.update` op).
- `outlineArc` gained a `protectedBriefsInRange` guard, applied unconditionally (not just from the
  new automatic trigger): a chapter is protected if its brief is `handEdited` or its chapter is
  already finalized (`chapters.status = 'done'`). Protected chapters are never persisted over; the
  response returns their existing DB row instead. Non-protected, AI-written briefs are written with
  `handEdited: false`.
- `GenerationService.finalize()` now calls a best-effort `maybeReconcileArc(projectId, chapter)`
  after the finalization graph succeeds: it finds the _approved_ arc containing the finalized
  chapter, skips if none or if the arc's last chapter just finalized, and re-runs `outlineArc` for
  that arc when `finalizedInArc % cadence === 0` (finalization is strictly sequential, gated by the
  existing `FIN_001` check, so `chapter - arc.chapterStart + 1` is a sound in-arc count) or when any
  remaining brief in the arc carries a non-null `staleReason`. Reconciliation failures are caught and
  logged as a warning — they never fail the finalize() call that triggered them.
- New config knob `generation.reconciliation.cadence` (default `5`) in `bootstrap.ts`, documented in
  `.env.example` as `GENERATION_RECONCILIATION_CADENCE`.

**Tests:** `tests/generation/arc-reconciliation.spec.ts` (new, 11 cases, real-Postgres house style) —
hand-edited/finalized-chapter protection, AI briefs marked not-hand-edited, cadence-triggered
reconciliation, early stale-triggered reconciliation, no-fire off-cadence/on-last-chapter/unapproved
arc, finalize survives a reconciliation failure, and `handEdited: true` from both human-edit paths.

**Validation:** `bun scripts/verify.ts apps/novel-forge-server` — 664 pass, 0 fail, 10 skip.

**Commit:** `2d8e50fc`

### P1-11 — Volume-completion epitome write

- Affected area: bible/volume-completion hook, `volumes.epitome` column (exists, unused).
- Acceptance criteria:
  - Either: an epitome gets written when a volume completes, so `forOutline`'s existing epitome
    support (currently inert) starts doing something — OR — the column is consciously dropped with
    a documented decision, per the recommendation doc's explicit either/or framing. Pick one and
    justify it in the commit/status entry; don't leave it half-done.

**Decision: implement the write** (not drop). The recommendation doc's own diagnosis names
`volumes.epitome` as exactly the kind of "information that would keep a story coherent at chapter
300" that's "never written" — dropping the column would abandon the defect this task exists to fix,
and the read side (`forOutline`/`forChapter`'s memory sections) was already fully wired and waiting.

**What changed:**

- New prompt module `epitome.prompt.ts` (key `epitome`, `kind: 'analytical'`, modeled on the
  simplest existing prompt, `title.prompt.ts`) + `EpitomeSchema` (single `epitome: string` field,
  `@Field` description carries the ~200-token/150-word soft target — no hard validator, matching
  house convention of prompt-text-only length guidance). Registered in `PROMPT_REGISTRY`, `PromptKey`,
  and a new `AiRole 'epitome'` mapped to the `helper` model group.
- `GenerationService.finalize()` gained a sibling best-effort hook to P1-10's `maybeReconcileArc`:
  `maybeWriteVolumeEpitome(projectId, chapter)`. Finds the `approved` volume whose `endChapter`
  equals the just-finalized chapter (exact equality — the precise "volume just completed" signal, and
  it can't re-fire on a later volume's chapters). Bails if the volume's epitome is already set (a
  one-time write, per the original design doc's "one-time analysis call" framing), or if no finalized
  chapter in the volume's range has a `summary` (logs a warning, skips rather than sending empty
  content to the model). Otherwise calls the model with the volume plan + ordered chapter summaries
  and writes the result with a `WHERE ... AND epitome IS NULL` guard (idempotent against a concurrent
  write). The whole model call + write is `.catch()`-wrapped into a warning log — never fails
  `finalize()`.
- No schema/migration change: `volumes.epitome` already existed as an unused column.

**Tests:** `tests/generation/volume-epitome.spec.ts` (new, 6 cases, real-Postgres house style) —
epitome written and distilled correctly from chapter summaries on last-chapter finalization; no write
on a non-last chapter; no write for an unapproved volume; existing epitome never overwritten; skipped
gracefully with no chapter summaries in range; `finalize()` survives a model-call failure.

**Validation:** `bun scripts/verify.ts apps/novel-forge-server` — 670 pass, 0 fail, 10 skip.

**Commit:** `aae9c155`

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

**What changed:**

- `briefs.pov` (nullable varchar, new column) and `mysteries.truthFactKey` (nullable varchar, no FK —
  matches the loose entity/fact-key convention used everywhere else in this schema) added via
  migration `0008_curly_zemo.sql`.
- `ChapterBriefSchema` gains an optional `knowledgeContract` field reusing the existing
  `KnowledgeContractSchema` shape verbatim (`pov: string[]`, `learns: {entityKey, factKey}[]`) so
  `parseKnowledgeContract`/CK3/CK4 accept it unchanged. `ChapterBriefSchema.pov` (singular narrator
  entityKey) and `knowledgeContract.pov` (the array of entities whose ledgered knowledge bounds the
  chapter) are kept as two distinct, already-coexisting concepts — not merged.
- `CatalogService.render()` gained a CANON FACTS section listing every `canon_facts` row for the
  project, including still-hidden ones, so the outliner can pick a real `factKey` instead of
  inventing one and can decide _when_ a hidden truth should surface. Safe specifically because this
  catalog reaches only planning contexts (`forOutline`, `forChatTurn`, `forArcPlanning`) —
  `ContextAssembler.forChapter`, the prose-writing pack, never calls `CatalogService.render`, so a
  still-hidden fact's text never reaches chapter generation. A dedicated test pins this boundary.
- `outline.prompt.ts` (bumped `2.1.0` → `2.2.0`) instructs the model to author `knowledgeContract`
  only when a chapter's events reveal something the catalog still marks unrevealed, using only
  factKeys that appear verbatim in the catalog.
- `GenerationService.outline()` and `outlineArc()` both now persist `pov` and `knowledgeContract`
  from the model's output (previously both fields were silently dropped at persist time in both
  paths). `outlineArc`'s new fields flow through the same `protectedBriefsInRange` guard from P1-10,
  so a hand-edited or already-finalized chapter's `pov`/`knowledgeContract` still cannot be clobbered
  by a re-outline.
- Mystery `truthFactKey` is wired through continuity-extraction, not the outline schema — mysteries
  are only ever authored there (`ContinuityMystery` → `applyContinuityDelta`'s upsert), never touched
  by the outline model. Added `truthFactKey?: string` to `ContinuityMystery`, applied via the same
  non-destructive `COALESCE(EXCLUDED.truth_fact_key, mysteries.truth_fact_key)` pattern already used
  for `question`, so an extraction that omits it never nulls out a previously-recorded truth.
- Deliberately not added: `pov` to `BRIEF_HASH_FIELDS` (`src/common/content-hash.ts`) — no in-scope
  path lets a human edit `pov` directly today, so it cannot drift unnoticed; adding it now would
  change every existing brief's content hash for no behavioral benefit. Flagged for whoever adds
  `pov` to `updateBrief`/`brief.update` next.

**Tests:** `tests/generation/knowledge-contract.spec.ts` (new, 8 cases) — arc-scoped and whole-book
persistence of `pov`/`knowledgeContract`; both left null when the model omits them; hand-edited-brief
protection extends to the new fields; a persisted contract round-trips through
`parseKnowledgeContract`; CANON FACTS catalog rendering (revealed and hidden); the safety boundary —
`forChapter`'s rendered pack contains neither the CANON FACTS header nor hidden fact text;
`truthFactKey` persistence and non-destructive merge through `applyContinuityDelta`.
`tests/ai/prompts.spec.ts` — outline v2.2 prompt-text assertions, schema round-trip (contract
optional, `pov: []` rejected via existing `minItems: 1`), `ContinuityMystery.truthFactKey`
optionality.

**Validation:** `bun scripts/verify.ts apps/novel-forge-server` — 681 pass, 0 fail, 10 skip.

**Commit:** `26c6b338`

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

**What changed:**

- `forChapter` now marks `volume_objective`, `arc_objective`, `writing_style`, and the resolved
  entity/ref sections `asStable`; `prev_ending`, `continuation_state`, the knowledge-contract sections
  (`known_facts`/`chapter_reveals`/`hidden_constraints`), and the rolling `memory` window stay
  volatile — they're inherently per-chapter. A new `splitSegments()` helper (`context/sections.ts`)
  re-derives `renderedStable`/`renderedVolatile` from a persisted pack's `sections` jsonb, for graph
  nodes that reload a pack by id rather than holding the freshly-assembled one.
- `generation.prompt.ts` (bumped `2.2.0` → `2.3.0`) declares `cacheStrategy: { stableVars:
['stableContext'] }` and splits its single `contextPack` var into `stableContext` (alone in the
  first human message) and `volatileContext` (second message, with the brief/ending-contract/
  guidance) — matching `chat.service.ts`'s already-working stable/volatile pattern.
- Fixed the rebrand/reforge bug exactly as diagnosed: `rebrand-convert.prompt.ts`/
  `reforge-write.prompt.ts` declared `cacheStrategy` but put the FULL joined pack (containing
  per-chapter volatile content) in the message their `cacheStrategy` called "stable," defeating the
  cache every chapter. Both now take separate `stableContext`/`volatileContext` vars; `forRebrand`/
  `forReforge` already had the correct stable/volatile split from RB4/RF3, so only the graph call
  sites (`chapter-rebrand.graph.ts`, `chapter-reforge.graph.ts`) needed to stop collapsing
  `pack.rendered` into one var.
- **Known fragility, not fixed (matches the doc's own softer "note" wording, not "fix")**:
  `applyAnthropicCacheControl` places its cache_control breakpoint positionally — first human
  message, unconditionally — and never actually reads `cacheStrategy.stableVars` by name; that field
  is documentation only. Every prompt touched by this task was structured to conform to that
  positional convention (stable content alone in the first human message) rather than rewriting the
  router to do named-var lookup, which would touch every already-working cached prompt path
  (chat-hub, etc.) for a P1 cost-lever task. Reordering a cached prompt's messages in the future will
  silently move the breakpoint onto volatile content with no test or type failure — flagged for
  whoever next touches a `cacheStrategy` prompt.
- **Deliberately deferred**: the judge (`judgeDraft` / `chapter-generation.graph.ts`'s `judge` node)
  builds `SystemMessage`/`HumanMessage` manually and calls `runToolLoop` directly, bypassing
  `modelRouter.structured()` entirely — so it cannot receive `cache_control` today regardless of any
  `cacheStrategy`. Folding the judge's tool-calling flow into `structured()` is a materially larger,
  separate change; out of scope here.
- **Two pre-existing bugs found and fixed in passing**: `generateGrok` called the generation prompt
  without its required `endingContract` var (would throw `Missing value for input variable` at
  render time — no test previously covered `generateGrok`, so this was live and undetected); and
  `chapter-generation.graph.ts`'s `repairRewrite` node was a third, previously-unhandled call site
  for the same prompt that also needed the stable/volatile var split.

**Tests:** `tests/ai/context-assembler.spec.ts` (new `forChapter` stable/volatile describe — segment
assertions, marker-based containment on `renderedStable`/`renderedVolatile`, stable-segment
byte-identity across unchanged canon), `tests/ai/prompt-caching.spec.ts` (mocked-provider block
injection for the generation path), `tests/ai/prompts.spec.ts` (updated versions/vars, cache-order +
`cacheStrategy` assertions for all three prompts), `tests/ai/rebrand-graph.spec.ts` /
`tests/ai/reforge-graph.spec.ts` (fake assemblers return distinct stable/volatile strings; assert the
convert/write call sites pass them separately), `tests/generation/prompt-cache-vars.spec.ts` (new,
end-to-end over the template DB — both the graph draft node and `generateGrok` pass real pack
segments as separate vars, `contextPack` no longer appears, `endingContract` is present).

**Validation:** `bun scripts/verify.ts apps/novel-forge-server` — 689 pass, 0 fail, 10 skip.

**Commit:** `86b45367`

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
