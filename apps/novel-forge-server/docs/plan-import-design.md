# Plan Import Design

A new-novel project's entire pre-generation plan — bible documents, entities, volumes, arcs, chapter briefs — can be authored offline by a CLI agent (Claude Code, Codex, …)
driven by the external `novel-plan-forge` skill, then loaded in one transactional call. The skill produces a human-editable markdown workspace and packs it into a single JSON
bundle; `POST /projects/:projectId/plan/import` validates the bundle as a whole and upserts it atomically, optionally running the exact approval logic the in-app gates use so
chapter generation can start immediately after the upload. Drives tasks PI1–PI3 in CLAUDE.md.

## 1. Behavior

- `POST /projects/:projectId/plan/import` body `{bundle, overwrite?, approve?}` → `{results, approval?, warnings}` where `results` holds per-collection counts
  `{created, updated, unchanged, pruned}` for `bible`/`entities`/`volumes`/`arcs`/`briefs`, `approval` is `{volumesApproved, arcsApproved}` when `approve: true`, and
  `warnings` is the non-blocking issue list from §3. Synchronous — pure DB writes, no AI, no job.
- New `PlanImportModule` (`src/modules/plan-import/`: `plan-import.controller.ts`, `plan-import.dto.ts`, `plan-import.validator.ts`, `plan-import.service.ts`, barrel),
  registered in `dynamic.modules.ts`. No schema changes — the bundle lands entirely in existing tables.
- Guards, in order: project exists (`PRJ_001`) and kind `new_novel` (`PRJ_003`); bundle `format`/`version` supported (`IMP_002`); any bundle-carried collection already has
  rows → `IMP_001` unless `overwrite: true`; `overwrite` itself is refused once any drafts or chapters exist (`IMP_003`) — wholesale plan replacement under written prose
  would orphan continuity, use the in-app editors instead.
- `approve: true` runs inside the same transaction after the upserts: the §4 approval pass. The generation precheck (approved volumes; approved covering arcs where a volume
  has arcs; briefs present) passes immediately afterwards.

## 2. Bundle format (the wire contract)

One JSON document, `{"format": "novel-forge-plan", "version": 1, "bible": [...], "entities": [...], "volumes": [...], "arcs": [...], "briefs": [...]}`. Every collection is
optional and independent — a bundle may carry only bible docs, or only briefs. Natural keys identify rows; database ids never appear.

- **bible**: `{section, slug, frontmatter?, body}`. `section` ∈ `project|world|power|plot|lore` — `story_state` and `ai` are app-managed and rejected. The
  `REQUIRED_BIBLE_DOCS` manifest (refinement §7) is the authoring checklist but is not enforced server-side: partial bundles are legal.
- **entities**: `{entityKey, type, name, significance?, status?, motivation?, notes?, body?}` — field parity with `CreateEntityBody`; `origin` is forced to `seeded`.
- **volumes**: `{volumeKey, ordinal, title, objective, conflict, payoff, targetChapterCount, cast?, body?}`. `startChapter`/`endChapter` never appear — approval derives them
  (§4). `epitome` is a source-pipeline field and is out of scope.
- **arcs**: `{arcKey, volumeKey, ordinal, title, objective, escalation, payoff, hook, chapterStart, chapterEnd, cast?, body?}` — absolute chapter numbers, same shape the
  arc planner emits.
- **briefs**: `{chapter, volumeKey, arcKey?, title, objective, events, requiredContext?, continuesIntoNextChapter?, startsFromPreviousChapter?, handoffBeat?,
  endingContract}` — the `ChapterBriefSchema` shape minus `pov` (the app itself never persists it). The server renders the stored `body` from
  `objective`/`events`/continuation flags via `renderBriefBody`, which moves from `generation.service.ts` to `src/common/brief-body.ts` so outline and import cannot drift.
  `endingContract` is required: contract-less briefs defeat the serial-pacing machinery the skill exists to feed.

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
  are untouched.
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

## 7. Authoring skill (PI3, external: `~/.claude/skills/novel-plan-forge/`)

Lives outside this repo (personal skill, discoverable from any authoring directory; plain markdown + a zero-dependency script, so Codex-class agents can follow the same
files). This section is the contract it targets; the bundle schema above is the source of truth.

- **Workspace** (`plan/` inside the user's novel directory): `bible/<section>/<slug>.md`, `entities/<entityKey>.md`, `volumes/<volumeKey>.md`, `arcs/<arcKey>.md`,
  `briefs/ch-<NNN>.md`. Every file is markdown with a `---`-fenced **JSON-object frontmatter** (agents emit valid JSON far more reliably than YAML, and it parses with zero
  dependencies); the markdown body maps to the item's prose field (`body` for bible/entities/volumes/arcs, `objective` for briefs).
- **SKILL.md process**: interview the user (premise, genre, length, chapter count) → bible docs against the embedded `REQUIRED_BIBLE_DOCS` manifest → entities → volumes
  (contiguous by ordinal, `targetChapterCount` each) → arcs per volume (exact coverage, hooks chaining) → briefs one per chapter (events in order, ending contracts whose
  `handoffState` chains into the next brief, `requiredContext` limited to `entity:`/`volume:` refs) → pack → upload. Authoring guidance is distilled from the app's own
  prompt modules (serial-webnovel pacing, hook types, escalation) so offline output matches what the in-app AI would produce.
- **`scripts/pack.mjs`** (node, no deps): walks `plan/`, parses frontmatter, mirrors the §3 cross-checks (drift is caught server-side regardless), writes `bundle.json`, and
  prints the counts plus upload instructions — the web **Import plan** screen or
  `curl -X POST <server>/api/v1/projects/<id>/plan/import -H 'content-type: application/json' -d '{"bundle": <...>, "approve": true}'`.

## 8. Limitations

- Pre-generation tooling: `IMP_003` blocks overwrite once prose exists; staleness propagation across an import into a generating project is deliberately not simulated.
- Briefs carry no `pov` (the app drops it at outline time too); volumes carry no `epitome`; the bundle carries no images, aliases, or relationships.
- `source`-kind projects are rejected — their plan derives from the source pipeline.
- The pack script's validation is a mirror, not the authority; only the server's `validatePlanBundle` gates the write.
