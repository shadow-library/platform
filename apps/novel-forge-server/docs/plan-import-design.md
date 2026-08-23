# Plan Import Design

A new-novel project's entire pre-generation plan — bible documents, entities, volumes, arcs, chapter briefs — could historically be authored offline by a CLI agent
(Claude Code, Codex, …) driven by the external `novel-plan-forge` skill, then loaded in one transactional call. That authoring path is now deprecated: in-app authoring
(the hub bootstrap interview, chat ops, and the facts panel — chat-hub-design.md, character-knowledge-design.md) is the primary way to build a plan. The bundle format and
`POST /projects/:projectId/plan/import` endpoint remain fully supported — they validate the bundle as a whole and upsert it atomically, optionally running the exact approval
logic the in-app gates use — because existing novels were authored with the skill and may still need re-import. Drives tasks PI1–PI3 in CLAUDE.md.

## 1. Behavior

- `POST /projects/:projectId/plan/import` body `{bundle, overwrite?, approve?}` → `{results, approval?, warnings}` where `results` holds per-collection counts
  `{created, updated, unchanged, pruned}` for `bible`/`entities`/`volumes`/`arcs`/`briefs`, `approval` is `{volumesApproved, arcsApproved}` when `approve: true`, and
  `warnings` is the non-blocking issue list from §3. Synchronous — pure DB writes, no AI, no job.
- New `PlanImportModule` (`src/modules/plan-import/`: `plan-import.controller.ts`, `plan-import.dto.ts`, `plan-import.validator.ts`, `plan-import.service.ts`, barrel),
  registered in `dynamic.modules.ts`. No schema changes — the bundle lands entirely in existing tables.
- Guards, in order: project exists (`PRJ_001`) and kind `new_novel` (`PRJ_003`); bundle `format`/`version` supported (`IMP_002`); any bundle-carried collection already has
  rows → `IMP_001` unless `overwrite: true`; `overwrite` itself is refused once any drafts or chapters exist (`IMP_003`) — wholesale plan replacement under written prose
  would orphan continuity, use the in-app editors instead. For the bible collection, "has rows" means _authored_ documents only: project creation seeds contentless
  `<section>/default` placeholders (`contentHash` null), and only importable sections count — a fresh project imports cleanly without `overwrite`.
- `approve: true` runs inside the same transaction after the upserts: the §4 approval pass. The generation precheck (approved volumes; approved covering arcs where a volume
  has arcs; briefs present) passes immediately afterwards.

## 2. Bundle format (the wire contract)

One JSON document, `{"format": "novel-forge-plan", "version": 2, "bible": [...], "entities": [...], "facts": [...], "volumes": [...], "arcs": [...], "briefs": [...]}`.
Every collection is optional — a bundle may carry only bible docs or only entities — but arcs and briefs must ship with their volumes: their ranges validate against the
bundle's computed volume layout, never against whatever the project happens to hold (single-brief fixes belong to the existing `PUT /briefs/:n`). Natural keys identify
rows; database ids never appear.

**Versions:** the server accepts `version` 1 and 2. v2 (character-knowledge design) added the optional `facts` collection and the optional brief `knowledgeContract`;
a v1 bundle is exactly a v2 bundle that omits both.

- **bible**: `{section, slug, frontmatter?, body}`. `section` ∈ `project|world|power|plot|lore` — `story_state` and `ai` are app-managed and rejected. The
  `REQUIRED_BIBLE_DOCS` manifest (refinement §7) is the authoring checklist but is not enforced server-side: partial bundles are legal.
- **entities**: `{entityKey, type, name, significance?, status?, motivation?, notes?, body?}` — field parity with `CreateEntityBody`; `origin` is forced to `seeded`.
- **facts** (v2): `{factKey, text, subjects?, constraintNote?, terms?, revealChapter?}` — canon facts for the character-knowledge ledger (character-knowledge design §3).
  `text` is the spoiler statement, `constraintNote` the POV-safe behavior injected while hidden, `terms` the lexical leak-scan list. No ledger rows import — knowledge is
  ledgered when briefs' `learns` are applied at draft approval, or via the manual reveal endpoint.
- **volumes**: `{volumeKey, ordinal, title, objective, conflict, payoff, targetChapterCount, cast?, body?}`. `startChapter`/`endChapter` never appear — approval derives them
  (§4). `epitome` is a source-pipeline field and is out of scope.
- **arcs**: `{arcKey, volumeKey, ordinal, title, objective, escalation, payoff, hook, chapterStart, chapterEnd, cast?, body?}` — absolute chapter numbers, same shape the
  arc planner emits.
- **briefs**: `{chapter, volumeKey, arcKey?, title, objective, events, requiredContext?, continuesIntoNextChapter?, startsFromPreviousChapter?, handoffBeat?,
endingContract}` — the `ChapterBriefSchema` shape minus `pov` (the app itself never persists it). The server renders the stored `body` from
  `objective`/`events`/continuation flags via `renderBriefBody`, which moves from `generation.service.ts` to `src/common/brief-body.ts` so outline and import cannot drift.
  `endingContract` is required: contract-less briefs defeat the serial-pacing machinery the skill exists to feed. v2 adds an optional
  `knowledgeContract: {pov, learns?: [{entityKey, factKey}]}` — omitted, the chapter is epistemically unfiltered, exactly like a hand-authored brief without one.

## 3. Validation

- Shape/enums/patterns via class-schema DTOs (keys `^[a-z0-9_]+$` for entity/volume/arc keys, `^[a-z0-9-]+$` slugs, integer minima, `hookType` enum).
- Cross-item invariants via a pure `validatePlanBundle(bundle)` (`plan-import.validator.ts`) returning `{issues, warnings}`; any issue aborts with a `ValidationError`
  (HTTP 400, `S003`) carrying one field error per problem (`volumes[2].targetChapterCount`, "…"), which the web UI renders as a list:
  - unique natural keys per collection; unique volume ordinals;
  - volume ranges computed as cumulative `targetChapterCount` sums in ordinal order — the same math as `approveVolumePlan`, so a bundle that validates always approves;
  - arcs: `volumeKey` resolves within the bundle; per volume, ordered by ordinal, contiguous, non-overlapping, and exactly covering the computed volume range
    (`ArcService.coversExactly` invariant). A volume with zero arcs is legal — the arc-less gate path;
  - briefs: `chapter` unique and inside a computed volume range; `volumeKey` equals the covering volume; when the covering volume has arcs, `arcKey` is required and must be
    the covering arc; otherwise `arcKey` must be absent.
- v2 knowledge checks: duplicate `factKey`s are issues; a `learns` entry naming a fact that exists neither in the bundle nor in the project is an issue (a reveal that can
  never be ledgered); unknown `pov`/`learns` entity keys and `subjects` refs are warnings (approve-time skips are logged and recoverable via the manual reveal endpoint);
  a bundle fact never revealed by any brief is a warning.
- Warnings (returned, never blocking): `cast`/`requiredContext` `entity:` refs resolving to neither bundle nor existing project entities; `requiredContext` prefixes other
  than `entity:`/`volume:` (threads, mysteries, and chapter summaries do not exist pre-generation; the ContextAssembler degrades unresolved refs gracefully either way).

## 4. Apply semantics

One transaction over raw drizzle (domain services own their own connections and are not transaction-composable; the import reuses the shared pure helpers instead):

- **bible** — `BibleDocumentService.upsert` semantics: `computeBibleDocHash` compare, unchanged rows untouched, changed rows bump `revision` and flag every project chapter
  `needsRevalidation` (vacuous pre-generation, correct under overwrite).
- **entities** — upsert by `entityKey`, `origin: 'seeded'`; images/aliases/relationships are never bundle-touched.
- **volumes / arcs / briefs** — upsert by natural key with `volumeContentHash`/`arcContentHash`/`briefContentHash`; content-identical rows count `unchanged` with no revision
  churn (re-importing the same bundle is a no-op); changed rows bump `revision`. Arcs and volumes land `draft`; briefs store the rendered body + `contextRefs` +
  `endingContract` and clear `staleReason`.
- **overwrite prune** — for each collection the bundle carries, existing project rows whose natural key is absent from the bundle are deleted (entity deletes cascade their
  gallery/aliases/relationships). Without pruning, leftover volumes from a prior import would silently corrupt the cumulative chapter mapping. Collections the bundle omits
  are untouched, and bible pruning only ever removes authored docs in importable sections — never the seeded `<section>/default` placeholders nor app-managed sections
  (`story_state`, `ai`).
- **approval pass** (`approve: true`) — `approveVolumePlan` (signature widened to accept the transaction handle) lays out chapter ranges and approves volumes; then every
  bundle volume that carries arcs gets its arcs flipped to `approved` with `staleReason` cleared — coverage was already proven statically in §3, and `assertWithinVolume`
  holds by construction.

Any failure rolls back the whole import; the response never reports partial writes.

## 5. Error codes

`IMP_` group in `AppErrorCode`:

- `IMP_001` CLIENT_ERROR — project already contains plan data for a collection in this bundle; pass `overwrite: true` to replace it.
- `IMP_002` CLIENT_ERROR — unsupported bundle format or version.
- `IMP_003` CLIENT_ERROR — overwrite is not allowed once drafts or chapters exist.

Reused: `PRJ_001`/`PRJ_003` guards, `S003` (ValidationError) for §3 issues, `PLN_002`/`ARC_002` cannot fire on a §3-valid bundle but remain the approval pass's backstop.

## 6. Web UI (PI2, `novel-forge-web`)

Project screen gains an **Import plan** entry: file picker for `bundle.json`, client-side parse previewing per-collection counts (and refusing non-`novel-forge-plan` files),
`overwrite` + `approve` toggles (overwrite gated behind an explicit confirmation), submit, then per-collection result chips (`created/updated/unchanged/pruned`), the approval
summary, and the warnings list. A 400 with field errors renders as a scrollable issue list so the user can fix the workspace and re-pack.

## 7. Authoring skill (PI3, retired — was external: `~/.claude/skills/novel-plan-forge/`)

The external `novel-plan-forge` skill is retired. In-app authoring is now the primary path for building a plan: the hub bootstrap interview walks a fresh project through
bible/entities/volumes/arcs/briefs (chat-hub-design.md), ongoing chat ops refine and extend them, and the facts panel manages the character-knowledge ledger
(character-knowledge-design.md). Nothing here targets an offline markdown workspace anymore.

The bundle format (§1–6) and `POST /plan/import` remain fully supported and are unchanged — they exist to re-import plans that were authored with the skill before its
retirement, and that path stays deprecated-but-functional for as long as those legacy novels need it. No new bundles should be hand-authored going forward.

## 8. Limitations

- Pre-generation tooling: `IMP_003` blocks overwrite once prose exists; staleness propagation across an import into a generating project is deliberately not simulated.
- Briefs carry no `pov` (the app drops it at outline time too); volumes carry no `epitome`; the bundle carries no images, aliases, or relationships.
- `source`-kind projects are rejected — their plan derives from the source pipeline.
- The pack script's validation is a mirror, not the authority; only the server's `validatePlanBundle` gates the write.
