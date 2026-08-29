# Interstitial Chapter Design — inserting, isolating, and amending unrestricted chapters

The chapter pipeline plans a brief, then writes it with the primary model. That model refuses dark, violent,
or sexual material an author may need on the page — today's only escape hatch is `generate-grok`, which is
vendor-named, can only fill a slot the plan already allocated, and cannot correct a chapter once it is
finalized canon. This document specifies **insertion** (adding a chapter the plan never allocated, at any
point ahead of the write frontier), **containment** (a real firewall around that chapter's content, independent
of who or what wrote it), and **amendment** (rewriting a finalized chapter's prose in place). It follows the
conventions of `ai-system-design.md`; §2 lists its amendments.

Drives checklist tasks **IC1–IC9** (plus two follow-ups: reader rating, web UI).

## 1. Problem & decisions

### 1.1 The containment bug this fixes

Containment today keys on the literal string `'grok'` in four places — `indexing.service.ts:28`,
`retrieval.service.ts:51`, `chapter-finalization.graph.ts:157`, `context-assembler.service.ts:466` and `:744`
— plus a fifth, softer one: `catalog.service.ts:47` tags a chapter `[grok]` in the outliner's catalog on the
same test. All five ask "was this chapter's `generator` column `'grok'`?" But `generator` is **provenance**,
not a content-safety signal, and two paths write a non-`'grok'` provenance to chapters that may carry the
exact material containment exists to firewall:

- `importDraft` (paste-your-own-prose) always writes `generator: 'human'`.
- `novel-import`'s `final` mode lands every chapter as `generator: 'human'`, `locked: true` (`novel-import-format.md`).

So a pasted explicit chapter is indexed into pgvector, retrieved by `search_prose`, fed to continuity
extraction, and tagged with no warning in the outliner's catalog — exactly the leakage Appendix A rule 8
exists to prevent. Containment must key on **what the content is**, not on **who or what produced it**.

### 1.2 Locked decisions

1. **Numbering.** Insert + renumber downstream, legal only ahead of the write frontier
   (`frontier = max(number)` over `chapters` with `status = 'done'`). Nothing locked or published ever moves —
   `chapter_publications.publishedOrdinal` needs no work.
2. **Writers.** A permissive model in-platform, or the author pastes prose. No external API keys, no outbound
   calls to third-party endpoints.
3. **Context firewall.** Downstream chapters see only summary + continuation state, never the prose — the
   existing adjacency rule (`ai-system-design.md` §3, "verbatim tail; summary+state if grok").
4. **Validation.** No judge loop on these chapters; canon write-back stays human-triggered (§10).
5. **Plan reconciliation on insert.** Auto-shift; re-render affected brief bodies; arcs and volumes grow
   silently.
6. **Brief origin.** Author's choice per insert: hand-written, or planner-generated from a one-line intent.
7. **Gating.** Allowed on any project, not only `contentMode: 'unrestricted'` ones — an author writing a
   `standard`-mode novel may still need one dark chapter.
8. **Summary gate.** Hard gate at finalize for isolated chapters (no summary, no continuation state ⇒ refused),
   with a one-click autofill that returns without persisting.
9. **Naming.** `content_generator` enum value `'grok'` becomes `'unrestricted'`;
   `/chapters/:n/generate-grok` becomes `/chapters/:n/generate-unrestricted`.
10. **Containment split from provenance.** `generator` stays provenance (`standard` | `unrestricted` | `human`);
    a new `chapters.isolated` / `drafts.isolated` boolean drives every exclusion.
11. **Amendment is prose-only.** The bible is **not** touched; no downstream chapter is flagged stale. The
    author is offered the existing `extract-to-bible` endpoint as a manual follow-up.
12. **The unrestricted writing default stays `x-ai/grok-4.6`.** `UNRESTRICTED_GROUP_DEFAULTS`
    (`src/modules/ai/defaults.ts`) is unchanged — `creative-writing-model-evaluation.md` rates the Grok family
    poorly as a prose writer, and this default is a deliberate content-policy exception, kept because the model
    will put adult material on the page where the alternatives on `UNRESTRICTED_LLM_ALLOWLIST` are more
    reluctant. The literal model id strings in `src/modules/ai/models.ts` (`x-ai/grok-4.6`, `x-ai/grok-4.3`,
    `x-ai/grok-imagine-image-2.0`) are real vendor identifiers, not our naming choice, and are untouched by the
    rename in decision 9.

## 2. Amendments to earlier documents

- **Amends `ai-system-design.md` Appendix A rule 8.** Was: _"Draft and grok-interlude content never enter an
  index. Unrestricted projects retrieve like Standard."_ Becomes: _"Draft and isolated content never enter an
  index, never retrieve, and never feed continuity extraction. Containment is driven by `chapters.isolated` /
  `drafts.isolated`, never by `generator` — provenance and containment are independent axes. Unrestricted
  projects retrieve like Standard; a project's `contentMode` never implies a chapter is isolated, and a chapter
  being isolated never implies its project is `unrestricted`."_ Every other rule-8-adjacent line in that
  document (§3's adjacency rule, §4's retrieval exclusions, §7's chat-hardening table, the state-diagram
  transition, the golden-test descriptions) is read through this split: wherever the doc says "grok" it now
  means "isolated."
- **Amends `reader-publish-design.md` §4 / hard rule 7.** Was: _"Payload is reader-clean… No forge internals
  (state jsonb, summaries, refs, judge output) ever cross the boundary"_ / _"Nothing spoiler-grade ever appears
  in a push payload."_ Both stay true; §11 below adds `contentRating` as an explicitly reader-safe field (a
  rating level is metadata about the content, not the content or a spoiler) and states the invariant that
  keeps the novel-level rating from becoming misleading once chapter-level ratings exist.
- `character-knowledge-design.md`, `chat-hub-design.md`, and `reforge-transform-design.md`'s amendments (rules
  9, 12–17) are unaffected; this document adds no new numbered hard rule, only the rule 8 amendment above.

## 3. Schema (IC1, IC5)

### 3.1 Enum rename

```sql
ALTER TYPE "public"."content_generator" RENAME VALUE 'grok' TO 'unrestricted';
```

Follow the precedent in `generated/drizzle/0019_green_baron_strucker.sql`, which did exactly this for
`content_mode` (`'grok_only'` → `'unrestricted'`). **Risk:** `drizzle-kit generate` may not recognize the value
rename from the schema diff alone and instead emit a drop-and-recreate of the enum type (which fails against
existing rows using the old value, or silently reorders). The generated migration for this task must be
inspected before it is committed and hand-edited to the `RENAME VALUE` form if drizzle-kit emits anything else
— this is the same check `0019` required.

`src/database/schemas/projects.ts`:

```ts
export const contentGenerator = pgEnum('content_generator', ['standard', 'unrestricted', 'human']);
```

### 3.2 Containment columns

`src/database/schemas/chapters.ts`:

```ts
isolated: boolean('isolated').notNull().default(false),
contentRating: jsonb('content_rating'),
```

`src/database/schemas/generation.ts` (`drafts`):

```ts
isolated: boolean('isolated').notNull().default(false),
contentRating: jsonb('content_rating'),
```

Both `contentRating` columns are typed `jsonb` holding the `ContentRating` shape from `@shadow-library/sdk`
(`packages/sdk/src/content-rating.ts`): `{ sexualContent?, violence?, darkContent? }`, each an independent
optional level. **Null means UNRATED, never `'none'`** — the SDK's own doc comment on `ContentRating` is
explicit that an absent dimension must never be defaulted to "no content," and the reader (§11) stores and
filters the two differently. Use `.$type<ContentRating>()` on both columns.

Backfill, in the same migration: `isolated = true` where `generator = 'unrestricted'` — this preserves exactly
today's containment behavior for every existing row at the moment the column is introduced; nothing already in
the database silently becomes retrievable or silently becomes firewalled.

### 3.3 Brief columns

`src/database/schemas/generation.ts` (`briefs`):

```ts
export const briefWriteMode = pgEnum('brief_write_mode', ['standard', 'external']);
// on `briefs`:
writeMode: briefWriteMode('write_mode').notNull().default('standard'),
insertedAt: timestamp('inserted_at'),
```

`writeMode: 'external'` declares at plan time that the primary writer must skip this slot — it is filled by
`generate-unrestricted` or `drafts/:n/import`, never by `GenerationService.generate`'s batch loop (§8).
`insertedAt` is nullable and set only on briefs created by `insertAfter` (§7); it is a provenance/audit field,
not a gate.

### 3.4 Revision source

`src/database/schemas/ai.ts`:

```ts
export const draftRevisionSource = pgEnum('draft_revision_source', ['generated', 'patched', 'rewritten', 'revised', 'imported', 'hand_edited', 'chat_edited', 'amended']);
```

`'amended'` is written only by `POST /chapters/:n/amend` (§10) — it is the one path allowed to write a
`draft_revisions` row for a chapter that already has no corresponding `drafts` row of its own (the chapter is
finalized canon; there may be nothing left in `drafts` to revise).

### 3.5 Error codes

Extending the existing `CHP` group in `src/classes/app-error-code.ts` (currently only `CHP_001`):

| Code      | Kind | Meaning                                                                           |
| --------- | ---- | --------------------------------------------------------------------------------- |
| `CHP_003` | 400  | Insert position is behind the write frontier (`max(number)` over `done` chapters) |
| `CHP_004` | 409  | Insert collides with an in-flight `generate` job for this project                 |
| `CHP_005` | 400  | Finalize refused — isolated chapter has no summary or continuation state          |
| `CHP_006` | 400  | Amend refused — chapter is not finalized canon (`status !== 'done'`)              |
| `CHP_007` | 400  | Summarize refused — draft has no prose yet                                        |

Baseline migration regenerated with `bun scripts/db.ts apps/novel-forge-server generate`; template DB rebuilt
with `create-template`.

## 4. Containment re-key (IC2)

Every one of the following switches its condition from `generator === 'unrestricted'` (post-rename) to
`isolated === true`. None of the five needs a schema change beyond §3.2 — this is a pure re-key.

| Site                                                        | Before                                             | After                                 |
| ----------------------------------------------------------- | -------------------------------------------------- | ------------------------------------- |
| `indexing.service.ts:28` (`addProse`)                       | `if (generator === 'grok') skip`                   | `if (chapter.isolated) skip`          |
| `indexing.service.ts:77` (backfill filter)                  | `doneChapters.filter(c => c.generator !== 'grok')` | `.filter(c => !c.isolated)`           |
| `retrieval.service.ts:51` (`AND ch.generator != 'grok'`)    | SQL filter on `generator`                          | SQL filter on `ch.isolated = false`   |
| `chapter-finalization.graph.ts:157` (`extractContinuity`)   | `if (state.generator === 'grok') skip`             | `if (state.isolated) skip`            |
| `context-assembler.service.ts:466`, `:744` (adjacency rule) | `isGrok = prevChapter.generator === 'grok'`        | `isIsolated = prevChapter.isolated`   |
| `catalog.service.ts:47` (outliner catalog tag)              | `ch.generator === 'grok' ? ' [grok]' : …`          | `ch.isolated ? ' [unrestricted]' : …` |

The catalog tag is the one site that is informational rather than exclusionary — it tells the outliner (which
sees titles only, per rule 7) that a chapter's content is firewalled. Keying it on `isolated` rather than
`generator` matters here too: a `novel-import` `final`-mode chapter that happens to carry adult content and is
marked `isolated` at import time (§8's `drafts/:n/import` extension) should show the same tag a
`generate-unrestricted` chapter does, even though its `generator` reads `'human'`.

`chapter-finalization.graph.ts`'s `commitProse` node (line ~95) currently writes
`generator: (state.generator as 'standard' | 'grok') || 'standard'` onto the chapter row — after the rename
this literal narrows to `'standard' | 'unrestricted'` and must also carry `isolated: state.isolated ?? false`
into both the `.values()` and the `onConflictDoUpdate` `set` (the same omission pattern as the `importDraft`
defect in §6 — get this one right the first time).

## 5. Remaining vendor renames (IC3)

Beyond the enum and the five containment sites (§4), the literal string `'grok'` (or the word "grok") appears
in ~12 more places across `ai-system-design.md` and in code paths that render user- or model-facing text:

- **`src/modules/ai/prompts/continuity.prompt.ts:7`** — the continuity-extraction system prompt literally says
  _"a grok-generated chapter (written by a human author or imported from a source novel)"_. This is sent to
  the model, so changing it changes the rendered prompt: **bump the prompt's version** and **regenerate its
  render golden** (the same discipline every other prompt-text change in this codebase follows). Reword to
  something generator-neutral, e.g. _"an isolated chapter (unrestricted-model output, hand-pasted prose, or an
  imported final-mode chapter)"_ — the prompt's job is unchanged (it still only runs for non-isolated chapters
  per §4, so this sentence is legacy framing more than a live branch, but it must stop asserting a false
  provenance).
- **`generation.controller.ts` / `generation.dto.ts` / `generation.service.ts`** — `generate-grok` →
  `generate-unrestricted` (§9); `GenerateGrokBody` → `GenerateUnrestrictedBody`; `generateGrok` →
  `generateUnrestricted`.
- **`ai-system-design.md`** — every prose occurrence of "grok" (the state-diagram transition
  `generate-grok`, the `search_prose` tool description, the LangSmith isolation note, the retrieval exclusion
  text, the golden-test descriptions in §10/A5/A9) is reworded to "unrestricted" / "isolated" per the rule-8
  amendment in §2. This is prose-only in that document; no code lives there.
- **Test names and fixtures** referencing `grok` (`tests/ai/context-assembler.spec.ts`,
  `tests/ai/model-router.spec.ts`, `tests/ai/model-router-cache.spec.ts`, `tests/ai/continuity-apply.spec.ts`,
  `tests/generation/draft-mutation-guards.spec.ts`, `tests/generation/prompt-cache-vars.spec.ts`,
  `tests/illustration/illustration.spec.ts`) are updated to the new enum value and endpoint name; test
  _behavior_ does not change beyond what §4/§9 already changes.
- `src/modules/ai/models.ts` and `src/database/schemas/projects.ts`'s `contentMode` enum
  (`'standard' | 'unrestricted'`, already correctly named since the `0019` migration) are **not** touched —
  the model ids are real vendor identifiers (§1.2 decision 12) and `content_mode` was already renamed.

## 6. Prerequisite defect fixes (IC4)

Two existing bugs in `generation.service.ts` must be fixed before or alongside this feature — the first
undermines the very containment split this design relies on; the second is the actual reason the feature has
felt vendor-locked.

1. **`importDraft` (line ~867) drops provenance on re-import.** `.values()` sets `generator: 'human'`, but the
   `.onConflictDoUpdate` `set` clause omits `generator` entirely, so re-importing prose over an existing draft
   row keeps whatever `generator` (and, after §3.2, whatever `isolated`) the row already had. Fix: add
   `generator: 'human'` (and the new `isolated`, `contentRating` fields per §8) to the `set` clause.
2. **`generateGrok` (line ~1063) passes a literal stub as the "project."** The call
   `this.modelRouter.structured(PROMPT_REGISTRY.generation, {...}, ctx, { contentMode: 'unrestricted' })`
   passes `{ contentMode: 'unrestricted' }` where `resolveModel` expects a project row — so it never sees
   `projects.config.models`, and a project-level model override is silently ignored. This is the sole reason
   the feature feels vendor-locked today: `UNRESTRICTED_LLM_ALLOWLIST` already lists four models
   (`x-ai/grok-4.6`, `deepseek/deepseek-v4-pro`, `z-ai/glm-5.2`, `moonshotai/kimi-k3`), none of which an author
   can actually select. Fix: load the real `project` row (already available to every other branch of
   `GenerationService`) and pass it through, exactly as every other `modelRouter.structured` call site does.

Both fixes are independent of the rename and the new endpoints; they can land as their own commit ahead of
IC5–IC9, or inside IC5 if that reads more coherently as one change — either way they must land before IC7,
which is the first task that exercises `generateUnrestricted` under real project config.

## 7. Insert service (IC6)

`ChapterInsertService.insertAfter(projectId: bigint, afterChapter: number, opts: InsertOptions)`, one
transaction:

```ts
interface InsertOptions {
  briefOrigin: 'hand' | 'planner';
  briefBody?: string; // required when briefOrigin === 'hand'
  intent?: string; // required when briefOrigin === 'planner' — one-line prompt for the planner
}
```

**Guards, in order:**

1. `afterChapter >= frontier` where `frontier = max(number)` over `chapters` with `status = 'done'` for the
   project — otherwise `CHP_003`. Nothing at or behind the frontier may ever be pushed by an insert.
2. No `generate` job in `('pending', 'in_progress')` for the project — reuse the exact query
   `GenerationService.generate` already runs for its own ordering guard (§8) — otherwise `CHP_004`. An insert
   racing a running batch would shift numbers out from under drafts the batch is mid-writing.

**Shift (two-phase negative parking).** `chapters_project_id_number_unique`,
`briefs_project_id_chapter_unique`, `drafts_project_id_chapter_unique` and the chapter-bearing keys on
`entity_appearances`, `entity_relationships` and `relationship_observations` are all non-deferrable, so a
straight `UPDATE ... SET number = number + 1` collides with itself mid-statement on the first row it touches.
Take `recombine.service.ts:227`'s pattern but park at the value's own negation rather than at a remapped one:
phase 1 sets `number = -number`, an involution onto a range no live row occupies, so no two parked values and
no parked-vs-unmoved pair can collide whatever order the rows are touched in; phase 2 lands them at
`number = -number + 1`, bounded below by `afterChapter + 2` and so clear of every unmoved row. Neither phase
depends on row ordering, unlike recombine's, whose remapped parking does.

**Which columns get shifted is an allow-list, not an analysis.** Shift _every_ integer column in
`src/database/schemas` that stores a forge chapter number, `WHERE value > afterChapter`, by the same two-phase
pass whether or not a unique constraint covers it. Do not reason about which columns can hold a value above
the write frontier: an earlier draft of this section claimed everything outside `briefs`/`drafts`/`chapters`/
`chapter_images`/`continuity_proposals` was written only at finalize of a `done` chapter, and that was wrong
twice — `character_knowledge.learned_in_chapter` is written at draft approval, which runs several chapters
ahead of the frontier in a single `generate` batch, and `applyContinuityDelta` writes the entity, thread and
mystery columns from a _draft_ via `applyContinuityProposal`. Both leaks are silent: the first opens
`knowledge-view.ts`'s `lt(learnedInChapter, chapter)` spoiler gate one chapter early. Reachability analysis is
what failed here and will fail again the next time a column is added, so the rule is mechanical.

The columns shifted are therefore `briefs.chapter`, `drafts.chapter`, `chapters.number`,
`chapter_images.chapter`, `continuity_proposals.chapter`, `context_packs.chapter`,
`entities.first_seen_chapter`, `entity_relationships.chapter`, `entity_appearances.chapter`/`first_chapter`/
`last_chapter`, `relationship_observations.chapter`, `canon_facts.reveal_chapter`,
`character_knowledge.learned_in_chapter`, `character_states.last_updated_chapter`, `beats.chapter`,
`world_facts.chapter`, `plot_threads.opened_chapter`/`closed_chapter`/`last_advanced_chapter`/`payoff_window`,
and `mysteries.opened_chapter`/`resolved_chapter`/`last_advanced_chapter`/`payoff_window`. The two
`payoff_window` columns matter beyond tidiness: `dormant-threads.ts` computes `currentChapter > payoffWindow`
and renders the verdict into arc-planning context, so leaving them behind reports a thread overdue one chapter
early to the planner.

Everything omitted is omitted by an explicit deny-list entry, each carrying its reason in the code:
`chapter_publications.chapter` and `.published_ordinal` (frozen historical pointers — moving one moves a
reader's URL); `projects.story_current_chapter` (a cursor over finalized prose, never above the frontier);
`chapter_chunks.chapter`, `validation_reports.chapter` and `extraction_runs.chapter` (written only from `done`
chapters); `volumes.start_chapter`/`end_chapter` and `arcs.chapter_start`/`chapter_end` (ranges, grown below
rather than shifted); `chapter_conversions`, `chapter_reforges`, `rebrand_glossary` and the `reforge_*` tables
(keyed to source projects, outside this path); and every `ordinal`, `*_count` and `chapters_analyzed` column
(positions and counts, not chapter numbers).

**Re-render and rewrite, per shifted brief:**

- Re-render `body` via the existing `renderBriefBody` (`src/common/brief-body.ts`) so a brief that quotes its
  own chapter number in prose stays correct.
- Rewrite `contextRefs` entries of the form `chapter:N` to `chapter:N+1` for every `N > afterChapter`.
- Rewrite `knowledgeContract` chapter references (the `learns[].factKey`/`pov` entries don't carry chapter
  numbers, but any chapter-number literal inside the contract's free-form fields does).

**Plan growth.** The arc whose `[chapterStart, chapterEnd]` contains `afterChapter` (or whose range starts
after it) grows `chapterEnd` by one; later arcs' `chapterStart`/`chapterEnd` both shift by one. The containing
volume's `endChapter` and `targetChapterCount` grow by one; later volumes' `startChapter`/`endChapter` shift by
one. This is deliberately silent per decision 5 — no approval re-gate, no `staleReason` set on the arc/volume
rows themselves (only on descendant drafts, below).

**The new slot.** Insert one `briefs` row at `afterChapter + 1`: `writeMode: 'external'`, `handEdited: true`,
`insertedAt: now()`. Its `body`:

- `briefOrigin: 'hand'` — `opts.briefBody` verbatim.
- `briefOrigin: 'planner'` — one call to the existing brief-planning path (whatever `PROMPT_REGISTRY` role
  already drafts a brief from a one-line intent plus surrounding context; do not add a new `AiRole`) seeded
  with `opts.intent`, the shifted-into-place neighbor briefs, and the volume/arc objective. This still returns
  before the transaction commits — the brief is small, unlike chapter prose, so there is no job/async path
  here, matching decision 6's "author's choice per insert" framing as a single synchronous call.

**Finish.** `markDescendantDraftsStale(projectId, afterChapter, 'a chapter was inserted after this point')`
from the insert point forward, reusing the private helper `GenerationService` already has (either lift it to a
shared location both services import, or inject `GenerationService` — prefer lifting, since `RecombineService`
and now `ChapterInsertService` both want it and neither should depend on the other's module for one method).

**Endpoint:** `POST /projects/:projectId/chapters/:afterChapter/insert`, body `InsertOptions`, synchronous
200 returning the new brief plus a summary of what shifted (`{ shiftedChapters: number, newChapter: number }`)
so the web UI (§12) can show the shift's extent before the author confirms — the confirmation itself happens
client-side before this call, since the operation is one transaction with no partial/undo state to review
after the fact.

## 8. Filling the slot (IC7)

**`POST /chapters/:n/generate-unrestricted`** (renamed from `generate-grok`, §5) — behavior otherwise
unchanged except: sets `chapters.generator` (via `chapter-finalization.graph.ts`'s `commitProse`, §4) and
`drafts.generator` to `'unrestricted'`, and both `isolated` columns to `true`. This is now legal on any
project (decision 7), and after §6's second fix, honors `projects.config.models` if the author configured an
override, falling back to `UNRESTRICTED_GROUP_DEFAULTS` (still `x-ai/grok-4.6` for writing, decision 12).

**`POST /drafts/:n/import`** (`ImportDraftBody`, extended):

```ts
@Field(() => ContentRatingInput, { optional: true }) contentRating?: ContentRating;
@Field(() => Object, { additionalProperties: true, optional: true }) state?: Record<string, unknown>;
@Field({ optional: true }) isolated?: boolean;
```

`isolated` defaults to `false` for ordinary hand-edits of standard chapters, but the author pasting explicit
content through this same endpoint (the paste-prose writer path from decision 2) sets it `true` — this is what
finally gives the paste path a real firewall (§1.1). `state` lets a pasted chapter carry continuation state the
finalize gate (§9) requires without inventing a second import endpoint. Also fixes the defect in §6 item 1.

**`GenerationService.generate`'s batch loop must stop, not skip, at an unfilled external slot.** Today's
`pending` selection (chapters with a brief but no draft yet, ascending) would happily draft an
`external`-write-mode chapter with the primary model — exactly the bug this feature exists to prevent.
Change: when walking `pending` in ascending order to build the `chapters` batch, **truncate** the batch
(don't skip past) at the first chapter whose brief has `writeMode === 'external'` **and** which has no
`chapters` row with `status = 'done'` yet. Once that chapter _is_ `done` (filled via `generate-unrestricted` or
`drafts/:n/import` + `finalize`), `generate` resumes past it on its next call — no special-casing needed
there, since a filled slot simply has a draft/chapter already and `pending` no longer includes it.

**Accepted cost, stated plainly:** a batch of 20 requested (`limit: 20`) with an external slot at chapter 4
yields chapters 1–3 only — 3 chapters, not 20, not 19-skipping-4. The author fills chapter 4 by hand, then
calls `generate` again to continue. This is the deliberate trade for decision 4 (no judge loop, no
autopilot-through-an-unfillable-slot) — silently skipping the slot and generating 5–20 would leave a
permanent hole a later run has no reason to notice.

## 9. Finalize gate & summarize (IC8)

**Gate.** `POST /finalize` (and the per-chapter `finalize` path inside it) refuses with `CHP_005` when the
draft being finalized is `isolated` and either `summary` or `state` is empty/null. This is the point where an
isolated chapter's continuation state must exist, because §4 has already made this chapter's prose invisible
to every downstream mechanism that would otherwise supply it (the adjacency rule now hands the _next_ chapter
only summary + state for an isolated predecessor — if those are empty, the next chapter drafts blind).

**Autofill.** `POST /chapters/:n/summarize` runs a permissive model (same routing family as
`generate-unrestricted` — this call also touches content the primary model may refuse to even summarize) over
the draft's prose and returns `{ summary: string, state: Record<string, string> }` **without persisting
anything**. The author reviews/edits the result client-side and saves it through the existing
`PUT /drafts/:n` (which already accepts `summary`) plus a `state` field addition to that same DTO — one-click
autofill, human-reviewed before it becomes the value the gate checks.

## 10. Amendment (IC9)

**`POST /chapters/:n/amend`**, body `{ title?: string, content: string, note?: string, contentRating?: ContentRating }`
— the only writer permitted past `chapters.locked`.

- Refuse `CHP_006` unless the chapter's `status === 'done'` (finalized canon). A non-final chapter is amended
  by the ordinary draft-revision path; amend exists specifically for the case those paths don't reach.
- Update the `chapters` row **without** the `setWhere: ne(schema.chapters.locked, true)` guard
  `chapter-finalization.graph.ts`'s `commitProse` uses (§4) — that guard exists to make a first-time commit
  refuse to clobber an already-final row; amend's entire purpose is to clobber an already-final row on
  purpose, deliberately and by explicit author action. `locked` stays `true` throughout; amend never unlocks.
- Append a `draft_revisions` row with `source: 'amended'` (§3.4) capturing the **post-amend** body — the same
  convention its `hand_edited`/`imported` neighbours use, recording what became canon rather than what preceded
  it — even though there may be no live `drafts` row for this chapter to attach it to conventionally — key it
  the same way `chapter_reforges`/`reforge_outputs` key their revision history: by `(projectId, chapter)`, not
  by a `draftId` FK. Consequence: the pre-amend prose is recoverable only as the _preceding_ row in that same
  chain, and for a chapter with no draft row at all (nothing to key the history to) it is not recoverable at
  all — amend replaces it outright.
- Re-embed via `indexingService.addProse` — it already calls `deleteProse` first (§4's site), so the
  re-embed is idempotent — **skipped automatically when `isolated`** (the same re-keyed condition, §4).
- If a `chapter_publications` row exists for this chapter: re-render the payload (`renderChapterPayload`,
  §11), and **only when `contentHash` moved**, bump `revision` and set `status = 'scheduled'` so the existing
  push outbox (`reader-publish-design.md` §5) picks it up on its normal sweep — an amend that changes nothing
  observable must not force a republish. `note` is not exempt from that: `renderChapterPayload` maps it to
  `authorNote`, and `chapterContentHash` covers `authorNote`, so a note-only amend does move the digest and
  correctly republishes. The true no-op is an amend whose title, content and note all come out identical to
  what was already published — e.g. a rating-only amend that leaves an already-unrated chapter unrated.
- Response carries a flag (`{ suggestExtractToBible: true }` or similar) telling the web UI to offer the
  existing `POST /chapters/:n/extract-to-bible` endpoint as a follow-up. It is **not** called automatically.

**Known consequence, stated honestly:** the bible and downstream chapters are untouched by design (decision
11). If the chapter being amended had already been extracted into canon before the mistake was caught, that
extraction stays in the bible and keeps propagating through every later chapter's context pack until the
author runs `extract-to-bible` again (or edits the bible entry by hand) — amend fixes the page, not the
canon the page already fed. This is the accepted cost of keeping amend a pure prose-replace with no automatic
re-derivation; automatic re-extraction would need to _retract_ facts a model can't reliably identify as
"no longer true," which is a materially harder and unbuilt problem.

## 11. Reader rating (cross-app)

Chapter-level content rating needs to reach the reader so it can filter/warn independently of the novel-level
rating `publications`/`novels` already carry as three separate columns
(`sexualContent`/`violence`/`darkContent`, each a `SexualContentLevel`/`ViolenceLevel`/`DarkContentLevel` from
`@shadow-library/sdk`). The chapter-level field is the richer `ContentRating` jsonb shape (§3.2); the two
coexist rather than unify, the same reasoning `reforge-transform-design.md` §5 uses for `chapter_reforges` vs.
`reforge_outputs` coexisting: one is a per-novel classification an author sets once, the other is a
per-chapter fact some chapters don't carry.

- **`novel-forge-server`:** `ReaderChapterPayload` (`src/modules/publishing/publish-payload.ts`) gains
  `contentRating?: ContentRating`, sourced from `chapters.contentRating`. `chapter_publications` gains a
  `content_rating jsonb` column mirroring it — not because the push renders from it (`renderLedgeredPayload`,
  `src/modules/publishing/publish-runner.ts`, always re-renders from the canonical `chapters` row, drift-guarded
  against the ledgered hash), but so the rating invariant below can rank every currently-published chapter's
  rating (`PublishingService`'s `assertRatingCeiling`) without a join back to canon for each ledger row.
  `title`/`authorNote`/`contentHash` are already duplicated onto the ledger row for their own reasons
  (`contentHash` drives the republish/drift decisions above; `title`/`authorNote` are historical record of
  what was actually pushed) — `content_rating` is the first ledger column whose reader lives outside the push
  path.
- **`chapterContentHash` (`@shadow-library/sdk/publishing`) includes `contentRating`.** This overrides that
  function's own doc comment — _"the field set is frozen; extend the payload only with a versioned hash
  alongside this one"_ — because a rating change must reach readers and the ledger's whole republish/no-op
  decision is hash-driven. The comment is rewritten to state what actually governs the set now: not "never
  change it", but **no edit may move the digest of a chapter whose reader-visible content did not change.**
  `contentRating` is hashed only when it carries at least one dimension — an unrated chapter omits the key
  entirely and keeps its historical digest.

  As implemented this is narrower than the consequence this section first anticipated ("every already-published
  chapter re-hashes"). It is deliberate: because absence is omitted rather than hashed as `null`, no chapter
  carrying no rating moves, so **the back catalogue is untouched and no reconcile sweep is required** — the
  pinned wire digests in `packages/sdk/tests/content-hash.spec.ts` still hold, and only a chapter that actually
  gains, changes or loses a rating re-hashes and republishes through the ordinary path. Unconditional inclusion
  was rejected because there is no deploy order that survives it: an old forge's legacy digest and a new forge's
  `null`-bearing digest disagree with whichever reader is live, so every push fails for the length of the window
  (and a re-push of the whole catalogue only churns reader ETags and caches for no reader-visible change).

- **Deploy order: `web-novel-server` first, then `novel-forge-server`.** The reader recomputes the digest from
  the payload it receives and rejects a mismatch with `WBN_011` (`PublishService.upsertChapter`); the forge
  ledgers that under the unsweepable `payload hash mismatch:` prefix, so failures need an explicit
  reconcile/republish rather than clearing on the next sweep. Forge-first therefore breaks every rated push —
  the old reader's DTO refuses the unknown `contentRating` property and could not reproduce the digest anyway.
  Reader-first is safe in both directions: an old forge sends no rating and its legacy digest, which the new
  reader reproduces exactly, leaving `published_chapters.content_rating` NULL (unrated). The third consumer,
  `webnovel-ingest`, needs no coordinated release — its unrated pushes keep validating — and can adopt the
  field whenever it can determine a rating. One in-flight caveat inside the forge: a ledger row scheduled
  before the deploy whose chapter is rated afterwards fails `renderLedgeredPayload`'s drift guard with
  "canonical prose changed since this publish was decided"; republishing the chapter clears it.
- **`web-novel-server`:** the table is actually named `published_chapters`
  (`src/modules/datastore/schemas/novels.schema.ts`), not `chapters` — add `content_rating jsonb` there;
  extend `ChapterUpsertBody` (`src/modules/publish/publish.dto.ts`) with the same optional field; the ingest
  path (`IngestPublishController`'s `PUT /:slug/chapters/:ordinal`) already routes through `ChapterUpsertBody`
  for both the forge-publish and the scraper-ingest producers, so no second DTO is needed.
- **`web-novel-web`:** regenerate `api-types.gen.ts` per the monorepo's non-atomic-contract rule
  (`AGENTS.md` "Hard rules"), from a running `web-novel-server`.
- **Invariant, validated at publish:** a publication's novel-level rating must be `>=` the max over its
  currently-published chapters, per dimension. Use the SDK's `ratingRank`/`compareRating` — an unrated chapter
  dimension (`undefined`) contributes nothing to the max (never coerce it to `'none'`); an unrated _novel_
  dimension with at least one rated chapter on that dimension is the violation to catch. Enforce it as a
  `PublishingService` check at `publish`/`schedule`/republish time, not a DB constraint (the two live in
  different columns/shapes and the comparison needs the SDK's rank tables). A violation **refuses the publish**
  with `PUB_009` naming every offending dimension; the novel rating is the author's published promise and is
  never raised automatically behind them. The check also guards `publishNovel`'s metadata update — a gate only
  on the chapter side would be bypassed by lowering the novel rating afterwards. The comparison itself lives in
  `src/modules/publishing/rating-invariant.ts` as a pure `findRatingViolations`, tested without a database.

## 12. Web UI (`novel-forge-web`)

Route `src/routes/novels/$novelId/chapters.tsx` (existing) gains:

- **Insert action** — pick "after chapter N," choose hand-brief vs. planner-intent, show the shift
  consequences (`shiftedChapters`, from §7's response) before the confirming call fires the actual insert.
- **`[unrestricted]` badges** on any chapter/draft/brief row where `isolated` is true (not `generator` —
  §4's re-key applies to the UI's read model too, so a `novel-import` chapter that came in isolated shows the
  same badge a `generate-unrestricted` chapter does).
- **Write-mode picker** on brief rows showing `writeMode: 'external'` — links directly to the
  generate-unrestricted / paste-prose actions rather than the normal generate button.
- **Rating picker** — a small `ContentRating` editor (three independent optional selects, "unrated" as the
  visible default state, never silently "none") wired to `PUT /drafts/:n` and `POST /chapters/:n/amend`.
- **Blocked-finalize state** — when `CHP_005` comes back, show the refusal plus the one-click "Summarize"
  button calling `POST /chapters/:n/summarize` and populating the (editable) summary/state fields from its
  response before the author retries finalize.
- **Amend action** on finalized (`locked`) chapters — opens the same editor surface, submits to
  `POST /chapters/:n/amend`, and on a response with the extract-to-bible flag (§10) surfaces a follow-up link
  to the existing extract action rather than triggering it.

`api-types.gen.ts` regeneration for `novel-forge-web` is required once IC5–IC9's endpoints exist, per the same
non-atomic-contract rule as §11.

## 13. What this design does not change

- The standard chapter-generation pipeline (brief → outline → generation → judge → drafts) for non-isolated
  chapters is untouched; §8's truncation is the only change to `GenerationService.generate`'s selection logic.
- `chapter_publications.publishedOrdinal` assignment and the reader's one-way push protocol
  (`reader-publish-design.md` §5–6) are unchanged; §11 only adds a field to an existing payload and ledger row.
- No new `AiRole`. Insertion's planner-origin brief reuses the existing brief-drafting prompt; summarize
  registers under the existing `role: 'continuity'` (`ROLE_GROUP.continuity === 'review'`), so on an
  Unrestricted project it runs on `deepseek-v4-pro`, not the writing group's `grok-4.6` — deliberately: the
  job is to _read_ explicit prose without refusing, which is a review concern (same reasoning that keeps the
  judge on the review group), not an authoring one. Amend needs no model call of its own beyond an optional
  future re-summarize, which is out of scope here.
- The bible schema and the extraction/judge pipeline are untouched (decision 11) — amendment is a prose
  replace with an offered, not automatic, follow-up.
