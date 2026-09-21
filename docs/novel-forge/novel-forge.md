# Novel Forge

## Purpose

- AI-assisted authoring workbench for long-form serialized web novels. An author (a project has one owner; bot-owned projects are shared with the owning organisation) develops an idea into a story bible and plan, has AI draft each
  chapter, reviews it against canon, finalizes it into canon, and publishes it to the reader app `web-novel` (`docs/web-novel.md`).
- Also processes existing manuscripts: adapt (rebrand), re-author (reforge), restructure (transform), translate.
- `novel-forge-server`: Bun/Fastify, Postgres + pgvector, LangGraph/LangChain. Every LLM call goes through OpenRouter; Ollama serves embeddings only.
- `novel-forge-web`: TanStack Start SSR workspace. Authenticates via Identity. Projects are owned by a person or an organisation bot, which reaches only routes that admit it.

## Concepts

- **Project `kind` is the workflow.** `new_novel` original authoring; `source` imported English manuscript being adapted; `translation` original-language novel translated to
  English; `curated` finished English manuscript held for publishing (never created directly; minted by curated ingest or reforge promote, and also reachable by the translation-to-curated workflow switch and by cloning).
  A project's `kind` can change via workflow switch, clone or reset; `contentMode` (standard or unrestricted) selects the permissive writer-class baseline.
- **Seed**: an idea in the Ideation Studio, not yet a novel. Generation, refinement, fact writes, publishing, insert/amend and clone refuse seeds (extract, consolidate,
  skeleton, export and illustration do not); graduation turns it into an active project.
- **Volume -> arc -> chapter brief.** Approval derives chapter ranges from volume target counts. Arcs partition a volume exactly and are optional. A brief carries context refs,
  an ending contract, an optional knowledge contract, and a write mode (`standard` or `external`).
- **Draft vs chapter.** A draft is working prose with a human review loop; finalizing writes a locked chapter and advances the story cursor.
- **Canon**: finalized chapters, bible (documents plus entities), trackers. Everything else is intent or working state, labeled as such in prompts.
- **Canon facts and character knowledge**: `canon_facts` hold spoiler-grade truths; the `character_knowledge` ledger records who learned which fact in which chapter. Facts
  with `source = 'seed'` are reader promises written at graduation, not withheld truths.
- **Isolated chapter**: content firewalled from indexes, retrieval and continuity extraction (`isolated`), independent of provenance (`generator`).
- **Proposal** (`refinement_proposals`): a staged change-set of content and action ops; the only way chat, audit, premise, arc-plan and plugin output changes domain data (pipeline graphs write their own results directly).
- **Context pack**: the exact text a model saw, split into a stable (cacheable) and a volatile segment, with a manifest of what was included, cut or unresolved.
- **Review queue**: drafts needing review or in contradiction, plus pending continuity proposals. Approval is author-initiated (but appliable from a chat action in auto mode); the judge only advises.

## Capabilities

- Ideation, bible building and audit, volume/arc/brief planning; chapter generation with judge and repair, revision, review, approval, finalize, amend, insert, unrestricted fill.
- Chat hub (manual or auto), change history with revert, illustrations, export (a `.novel` zip), validation, plan/novel import, curated ingest, per-novel plugins, per-account AI quota.
- Source pipeline (extract, consolidate, skeleton, recombine, rebrand, reforge, transform), translation, and publishing (scheduling, access control, reconcile, spoiler-gated wiki).

## Architecture

- Jobs and most HTTP requests run through `WorkflowRunService` (one run row, `thread_id = run.id`) -> LangGraph graph -> nodes -> services and chains via `ModelRouterService`;
  plan, outline, revise and the standalone judge call the router directly. Checkpoints live in Postgres, pruned at boot after seven days. Jobs are Postgres rows dispatched under
  a per-replica, per-project lock; a duplicate (project, kind, target) request returns the active job.
- Model routing: roles map to author-selectable groups, overridable per project; an Unrestricted alternate map with an allowlist exists. There is no local chat-model path
  (embeddings are local, via Ollama). AI quota is per owner and fails open on a database read error.
- Retrieval: pgvector indexes of finalized prose and lore, filtered by project; derived data, rebuildable. Realtime: SSE; a dropped client never aborts a chat turn.
- `novel-forge-web` navigation and guards derive from one screen list keyed by project kind. It never renders a containment badge from `generator` (it reads `isolated`; `generator` only drives a provenance chip). `novel-forge:admin` (role `NovelForgeAdmin`,
  never default or bot-grantable) gates run inspection. It is an RBAC permission evaluated per organisation, not a scope, so the web reads it from `GET /api/v1/access`, never the
  session; the `adminOnly` nav flag only hides the entry, and each admin route gates itself in `beforeLoad`. Bots reach almost every project route but cannot publish.

## Flows

- **Generation**: gates (volumes and arcs approved, briefs present and not stale, no unresolved contradiction; a second generate request returns the active job) -> brief -> context pack -> draft ->
  deterministic check -> judge -> route. The judge has read-only tools over prose, lore, entities, summaries, world facts and plot threads (bible, arcs, briefs and drafts are
  chat-hub-only); a contradiction verdict must carry a hard finding, and deterministic checks block acceptance without hardening the verdict; unparseable judge output goes to
  human review, never acceptance. autoFix patches then rewrites up to a cap, then accepts as-is with findings kept. A failed run stops the batch; batches truncate at an unfilled `external` slot.
- **Approval** is author-initiated (chat auto mode can apply it), may override a contradiction (recorded), and ledgers the brief's `learns` in the same transaction; hand edits reset it.
- **Finalize** runs strictly in order; refuses when an earlier chapter needs re-validation or the latest validation report holds an error for this chapter. The continuity delta goes
  through proposals (auto-applied; low-confidence entries stay pending; isolated chapters are skipped, not extracted). Arcs are re-outlined periodically, protecting hand-edited, drafted and finalized briefs.
- **Ideation**: studio turns stage seed proposals; graduation is deterministic (premise, reader-promise documents, one seed-source fact per promise; no volumes or entities).
- **Chat hub**: one conversation over the whole novel; context is an index, detail via declared lookups (never native tool binding). Manual mode stages a proposal; auto applies it.
- **Rebrand** (source only; runs recombine first, best-effort, merging translator-split parts): glossary seed, then per chapter convert -> deterministic residue scan -> audit -> at most
  one repair by default (`settings.maxRepairs`), else flagged. Output lives beside untouched source rows; the glossary only grows.
- **Reforge** (source only): reuses the rebrand glossary. `chapter` mode rewrites each chapter under a fidelity judge (beat coverage, naming consistency and real-world residue; never taste). `transform` mode: analysis ->
  human-approved plan of source spans (keep, condense, merge, drop) -> N:M output chapters with a cut ledger -> promote into a new `curated` project.
- **Translation**: originals arrive by paste or bot ingest; a reviewed glossary; serial chapter translation with fidelity checks; finalize copies English into locked chapters.
- **Plugins**: operator-loaded (off unless `plugins.dir` is set), per project, answering only five fixed decision points (canon augment, brief policy, call routing, context/prompt contribution).
- **Curated ingest**: an organisation bot creates `curated` projects and pushes chapters by source reference.

## Publish boundary

- One way, forge -> `web-novel-server`, over an identity M2M token. Reader library and progress stay reader-side; accounts are Identity's.
- The forge owns the publication ledger, access control and slug; the reader holds a rebuildable projection keyed by the project id the forge sends as `sourceRef`, so renaming a slug
  moves the row. Converge order: novel, access, chapters, wiki.
- The ledger row is the outbox: failed pushes are retried, except stale, hash and slug conflicts, which wait for an explicit reconcile; `reconcile` diffs reader against ledger. Wiping the reader and reconverging MUST yield identical state.
- The wiki is derived, never authored on the reader: entities and canon facts are projected into facets gated by `visibleFromOrdinal`. Hidden entities, never-revealed facts and
  fragments of unpublished chapters are never sent.

## Hard rules

### Model, graph and context

- Every model call MUST go through `ModelRouterService`; nodes and services NEVER build model clients, chains NEVER persist, retrieval NEVER calls a chat LLM.
- Authoring calls (draft, revise, repair, builder, planners, outline) MUST have zero tools; write tools NEVER exist. Only verification (judge, validation) and chat-hub lookups use
  the read-only tool registry, and `projectId` NEVER appears in a tool input schema.
- Nothing user-visible MAY exist only in a checkpoint; domain tables win. Node effects MUST be idempotent. Graphs MUST run to a terminal state; NEVER pause one for human review.
- Raw model output MUST be persisted before parsing; structured calls use the repair ladder; domain-invalid output NEVER enters the database as canon.
- Context MUST be assembled once per run, token-budgeted, tier-labeled and persisted as a pack; graph state holds the pack id, NEVER canon text. The stable segment MUST stay
  byte-identical while canon is unchanged; chapter or source prose travels as a template variable, NEVER inside the pack.
- The drafter MUST see only the mandatory serial core plus refs its brief declared; broad canon access belongs to the outliner (a catalog of citable refs, each with a short description) and the judge. Retrieval
  runs only at outline time, in verification and chat-hub tools, and in search.
- Prompt text MUST live in versioned code and the version MUST bump on any wording change; every call logs `promptKey@promptVersion`. Plugin policy digest MUST be in any
  `llm_cache` key; only deterministic roles are cacheable, creative roles NEVER. `runId` MUST correlate runs, model calls, tool calls, packs and messages. Prefer deterministic
  code over AI wherever code can decide.

### Canon, containment and knowledge

- Draft and isolated content MUST NEVER be indexed or retrieved; the finalize path skips continuity extraction for isolated chapters, but the manual continuity and
  extract-to-bible endpoints do not (do not rely on them for containment). Containment MUST key on `isolated`, NEVER on `generator` or `contentMode`. A
  downstream chapter sees an isolated predecessor only as summary plus continuation state; finalizing an isolated draft requires both.
- A call whose writer class a plugin raised (or an unrestricted fill) MUST write `generator: unrestricted` and `isolated: true`; raising and isolating are one act, sticky for the run.
- Finalized prose (`chapters.locked`) MUST NEVER change except through amend (the source-chapter PATCH/DELETE routes are unguarded), which never unlocks, never touches the bible, and republishes only when the reader-visible hash moves.
  Proposals NEVER edit briefs at or before the story cursor or prose of a final draft.
- Generation context MUST NEVER contain an unrevealed canon fact. Spoilers live in `canon_facts`, NEVER in bible prose or entity sheets, and canon facts are NEVER indexed. The
  drafter sees only facts ledgered to the POV cast, this chapter's planned reveals and POV-safe notes; only the judge sees the forbidden list (seed-source facts excluded).
  Reveals MUST be ledgered deterministically at draft approval, never extracted from model output.
- Insert MUST shift every chapter-number column via the explicit `SHIFT_TARGETS` list (an unlisted column is silently not shifted); it is legal only ahead of the write frontier
  and never while a generate job is active. Recombine does not shift; it refuses once anything references chapter numbers.
- Entity canon MUST exist as entity records, not cast narrated in a document. `staleReason` is a signal only: it never demotes an approved plan artifact, but a stale brief
  blocks generation and a stale draft cannot be approved.

### Proposals and chat

- Chat, audit, premise, arc-plan and plugin output MUST NEVER write domain tables directly (the studio's own readiness/concepts columns are the exception); only a proposal apply does, in a transaction with a baseline conflict check.
- Every apply MUST capture inverse ops; revert runs through the same engine under a content-hash conflict guard. NEVER add an apply path that skips inverse capture.
- `action.finalize` and `action.graduate_seed` MUST NEVER be auto-applied. Action ops run after the content transaction commits and stop at first failure.
- A chat turn MUST NEVER propose a whole-record overwrite for a record it did not fetch in the same turn; every turn is a fresh run, state lives in chat tables.
- Plugins MUST NEVER register routes, hold the database client, write domain tables, move chapter ranges/ordinals/parentage, or issue `action.*` ops; durable changes are
  allowlisted proposals. Material a safe model would refuse stays in plugin storage and reaches only permissive-class calls via gated context, NEVER core artifacts. A failing
  plugin degrades its decision point and MUST NEVER fail a generation.

### Transform and pipelines

- A transform write MUST NEVER invent structure: the approved plan is the only authority for output chapters; no write runs against an unapproved or superseded plan; plans are
  never auto-approved. Cut material MUST stay cut: the ledger is append-only, rendered into every later output chapter as a risk-ranked, token-budgeted slice, and a resurfaced cut is a judge issue.
- Rebrand, reforge, recombine MUST refuse non-`source` projects; translation refuses non-`translation`; generation, planning and outlining refuse seeds, `translation`, `curated` via `assertAuthoringProject` (unrestricted fill and `/skeleton` are not guarded).
- Rebrand, reforge and translation flag and continue per chapter (extract and generate stop at the first failed chapter); a failed run NEVER overwrites a good translation row, and a finalized translation is never a target. Phase and resume state MUST be
  derived from data, never advisory status columns.
- Translation glossary is pipeline data, not canon; nothing reaches `chapters.content` except through finalize, which refuses on pending terms, stale glossary or changed original.

### Publishing

- Content flows forge -> reader only. `publishedOrdinal` MUST be assigned once, NEVER re-derived from chapter numbers. Only locked, non-empty chapters publish, contiguously.
- Every push MUST be idempotent (`contentHash`). No forge internals or unrevealed facts in a payload; a chapter payload admits only `contentRating` (the novel payload adds blurb, cover, genres, tags, status,
  visibility and three rating dimensions), unrated is never sent as `none`, and a hash change MUST NOT move the digest of a chapter whose reader-visible content is unchanged.
- A novel-level rating MUST NEVER fall below the highest published-chapter rating per dimension (the forge refuses, never raises). Publishing is NEVER automatic on approval (an amend or translation finalize reschedules an already-published chapter).

## Non-goals

- No auth beyond Identity, local chat models, graph interrupts, reader-side editing, reader-account access, auto span reordering or plan approval, partial promotion, or amend retraction.

## Open work

- Bible audit does not flag spoiler prose outside `canon_facts`; nothing scans for it.
- Cancellation is process-local: a cancel reaches only the replica running the work.
