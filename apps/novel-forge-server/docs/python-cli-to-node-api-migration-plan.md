# Lore Forge (Python CLI) → Novel Forge Server (Node/TS API) — Migration Plan

> **Audience:** a Claude Code Sonnet session that will implement this migration.
> **Source app:** `/Users/leander-paul/repositories/ai-workspace/lore-forge` (Python 3.14, Typer CLI, SQLite + Markdown + LanceDB).
> **Reference app:** `/Users/leander-paul/repositories/shadow-library/pulse-server` (Bun + `@shadow-library/*` framework, Drizzle + PostgreSQL, Fastify).
> **Target app:** this repo, `/Users/leander-paul/repositories/shadow-library/novel-forge-server` (currently an empty scaffold cloned from the pulse template).
>
> **Rules for the implementer:** Do not modify the Python app. Do not keep SQLite. Do not keep Markdown as a primary store. Do not create placeholder/stub endpoints. Follow the reference app's architecture exactly. Implement every command listed in §4 — including the obscure ones (`consolidate`, `skeleton`, `backfill`, `prompt`/`import`, `illustrate`, `reset`).

---

## 1. Executive Summary

**What is being migrated.** Lore Forge is a long-running, resumable pipeline that (A) ingests a source web novel chapter-by-chapter and builds a structured "understanding" of it, and (B) writes a brand-new original novel from a Markdown "lore bible" through a draft → judge → revise → finalize loop, with AI at every stage. It ships as a Typer CLI. State lives in **three** places today:

1. **SQLite** (`projects/<name>/lore.db`) — chapters, the knowledge graph (entities, relationships, beats, threads, world facts, mysteries, summaries), the volume/arc plan, a resumable job queue, extraction/validation provenance.
2. **Markdown** (`projects/<name>/bible/`, `drafts/`, `briefs/`, `handoff/`) — the new-novel canon (the "lore bible"), chapter drafts, per-chapter briefs, and export prompts. Machine-readable fields live in YAML frontmatter; prose lives in the body.
3. **LanceDB** (`projects/<name>/vectors/`) — prose-chunk embeddings for semantic retrieval.

**Target architecture.** A stateless, multi-tenant HTTP API on the `@shadow-library/*` framework (the same stack as pulse-server), with **all** persistent state in **PostgreSQL** (via Drizzle ORM). A "project" becomes a first-class database row; every other table carries a `project_id` FK (row-level isolation replaces the one-SQLite-file-per-project isolation). Markdown and SQLite are both eliminated:

- The Markdown bible is **normalized into relational tables** (entities, arcs, world facts, threads, trackers…) plus a small `bible_documents` table for genuinely free-prose sections (vision, world, power, plot, story-state, style). Machine fields become columns; prose bodies become `text` columns; frontmatter that is truly heterogeneous becomes `jsonb`.
- LanceDB is replaced by **pgvector**, driven through **LlamaIndex.TS**.
- The AI layer is re-expressed as: **LangChain** for single-shot structured LLM calls, **LangGraph** for the multi-step stateful workflows (the generation autopilot: draft → judge → patch/rewrite → re-judge loop), and **LlamaIndex.TS** for indexing/retrieval/RAG.

**Business logic to preserve exactly:** resumability (cursor + idempotent job queue + upsert-by-key), the draft/finalize gate, the continuity judge with `[HARD]`/`[SOFT]` tagging, the serial "anti-branching" draft-memory brief assembly, the auto-fix patch-first repair loop with early-stop, the continuity write-back on finalize, deterministic chapter→volume layout (§1.1.16), significance/relationship consolidation, and cost estimation.

### 1.1 Confirmed decisions (these OVERRIDE anything else in this document)

These were decided by the maintainer and take precedence over the defaults inherited from the Python app or my earlier assumptions:

1. **No data migration.** There is no legacy data to import. §9 is repurposed to the job/concurrency/provider design; there are **no** migration scripts, migration tests, or migration checklist items. Do not add `bun:sqlite`/`better-sqlite3` anywhere.
2. **No auth now, but the design must be auth-ready.** Build every mutating route and every project-scoped resource so an ownership/permission layer can be added later **without reshaping tables or endpoints**: add a nullable `ownerId bigint` column to `projects` (unused for now), keep a guard seam (an empty/no-op `AuthGuard` applied at the module or controller level that currently allows all), and scope all queries by `projectId` (already required) so a future `WHERE ownerId = :caller` is a one-line addition.
3. **Job status must be queryable at any time.** The in-process async runner is fine, but the `jobs` table + `GET /jobs/:id` (and `GET /projects/:id/jobs`) must reflect live status/progress at all times (see §7.7).
4. **Embeddings = `ollama/qwen3-embedding:8b`** (not Voyage), **truncated (Matryoshka/MRL) to 1024 dims**. pgvector dimension = **1024** (`EMBEDDING_DIM=1024`, a single migration/config constant).
5. **Illustration = OpenAI image generation** (not Gemini) — `openai` provider, `gpt-image-1`.
6. **Only the removed source adapter** is supported now (behind the adapter registry seam; others are add-only).
7. **AI providers are config/env-selectable, including local subprocess providers.** Support `ollama` (local server) plus the subscription **subprocess** providers `anthropic-claude-code` and `openai-codex`, enabled by env flags / project config — primarily for local development. (This reverses the earlier "drop CLI providers" assumption.) API-key providers `anthropic` and `openai` remain.
8. **Illustration image storage is a swappable provider** (NestJS-style DI, which `@shadow-library/*` supports via dynamic modules). Ship a **local-folder** implementation now behind an `IMAGE_STORAGE` token + `ImageStorageProvider` interface; a cloud (e.g. S3) implementation must be swappable by changing one module registration — no service code changes (§9.4).
9. **No durable external queue** — the in-process runner is sufficient.
10. **Concurrency policy (§9.2):** external-API jobs for **different** novels run **in parallel**; external-API jobs for the **same** novel run **serially**; any job using a **local LLM** (ollama / claude-code / codex subprocess) always runs **serially** (globally).
11. **Grok-only content mode for adult/uncensored novels (§8.5).** A project carries a `contentMode` (`standard | grok_only`). Some novels contain adult content or must be authored wholesale by **Grok (xAI)**; because every prose-touching role (extract/generate/judge/validate/review/continuity) sees the text, and the other providers (Anthropic/OpenAI) **will refuse** to evaluate uncensored content, a `grok_only` project routes **every LLM and image role to `xai` and calls no other provider at all** (fail-closed). Embeddings/retrieval — for which xAI has no model — are **disabled** for `grok_only` projects (retrieval is best-effort and already degrades to empty, so generation is unaffected); no local/other embedder is substituted, honoring "no other ML models." A `standard` project never uses Grok unless explicitly configured.
12. **Grok interlude chapters inside a `standard` project (§8.6).** A `standard` project must also be able to write **individual** chapters with Grok (adult interludes). These are **human-reviewed, not auto-judged** (the automated judge would refuse the content). By default such a chapter is committed to the manuscript but its knowledge is **NOT** written back to the lore bible or indexed for retrieval (most interlude content need not be maintained as canon). An **opt-in promotion** re-runs the continuity write-back **with Grok**, but instead of auto-applying it, **stages an editable proposal**: the UI shows exactly the bible changes Grok proposes, the human may **edit** them and then **apply or discard** — nothing enters the bible without that human decision.
13. **New-novel creation → high-level brief → full lore-bible generation (§8.7).** After a `new_novel` project is created, the user is prompted for a **high-level description of what the novel is about**. From that single brief the system **generates the entire lore bible** (vision, world, power system, plot, primary characters, factions, locations, and a draft Volume plan) — everything `status: draft`/`planned`. The user then **edits any section** via the bible CRUD endpoints (§7.3) to align it to their needs. This is a from-scratch variant of the source-based `newnovel`; the raw brief is stored on `projects.brief`.
14. **Novel settings — reassign any operation's model at any time, except Grok-locked ones.** A project's per-role model config (§8.0) is editable anytime via `PATCH /projects/:id` (`config`) and takes effect on the next operation, so any operation's model can be A/B'd live. The exception: a `grok_only` project (and the grok-interlude operations, §8.6) are **locked to xAI** — attempting to reassign them off `xai` is rejected `AI_003`.
15. **Clone a novel into another (§7.1) for model A/B testing.** `POST /projects/:id/clone` deep-copies a project so the **same input** can be run through **different models** and the outputs compared. Default `resetDerived: true` copies only the inputs (source chapters + cursor, or the authored bible + brief) and drops derived data (extracted knowledge, drafts, generated chapters, embeddings, reports); each clone then regenerates cleanly under its own `config`.
16. **Single "Volume" planning unit (rename + flatten `arc` → `Volume`).** The Python app plans in a two-tier volume→arc hierarchy, which is confusing. **The target uses ONE planning/generation unit called a `Volume`** — it is the Python "arc" renamed, and the old grouping "volume" tier is removed. A Volume owns a contiguous block of chapters (`chapters_per_volume`, default 5), carries objective/conflict/payoff/ordinal/cast/status/body, and gates generation via `draft → approved`. Everywhere the source said "arc" the target says "Volume": table `volumes` (was `arcs`), `volumeKey` (was `arcKey`), `/volumes` routes, `chapters_per_volume`. **Exception:** a _character arc_ (a character's development journey, e.g. `skeletonCharacterArcs`) keeps that name — it is standard, unrelated to plot structure. §2 documents the source's original volume/arc terms faithfully; §5–§8 use the flattened `Volume`. **Amended by `docs/interactive-refinement-design.md` §2.1:** Volume remains the top planning tier, but an `Arc` sub-tier (new semantics, not the Python arc) is reinstated inside volumes, and chapter→volume layout becomes cumulative per-volume `targetChapterCount` instead of a global `chapters_per_volume`.
17. **Web-novel only, in very simple English (§8.0).** Every prose-authoring model call (generation, revision, auto-fix, outline, newnovel, plan, and the bible-builder) carries a global directive: produce **web-novel-style** content only, and write in **very easy-to-understand English** — short sentences, common everyday words, minimal jargon or archaic phrasing — so it reads clearly for a broad, non-native-English audience. This is prepended to the authoring system prompts (not the analytical extract/judge/validate prompts, which reason over text rather than write prose).

---

## 2. Source Application Analysis

### 2.1 Layout (important files)

```
src/lore_forge/
  cli.py                 Typer entry — every command; --project/-p, global -v, --model/-M overrides
  config.py              Config model (pydantic), role→provider/model map, models.yml registry, deep-merge layering
  project.py             Project: owns dir, SQLite conn, VectorStore, resolved config; path layout
  logging_config.py      structlog console+JSON-file logging (out of scope; use framework Logger)
  costing.py             per-role token/cost estimator over the registry
  bible.py               Markdown lore-bible reader/writer (frontmatter + body); trackers; approve gate; write-back helpers
  drafts.py              Draft files (chapter_NNNN.md) + STATUS.md + DRAFT_STATE.md; continuation-state frontmatter
  briefs.py              Per-chapter outline briefs (top-level module; write/numbers/body_for)
  storage/
    schema.sql           Full SQLite DDL (see §2.6)
    db.py                connect() (WAL, FKs), transaction() context manager, schema apply (idempotent = migration)
    repo.py              Repo: all SQL, idempotent upsert-by-key writes, RESET_STAGES, reads for asset rendering
    vectors.py           LanceDB wrapper (chapter_chunks table; add/search/reset/embedded_chapters)
  llm/
    base.py              LLMAdapter ABC: complete / structured / embed / generate_image
    registry.py          ModelRouter: role→adapter, retry w/ exp backoff, tracing, tolerant JSON extraction
    prompts.py           ALL prompt builders + JSON schemas (extraction, new-novel, plan, skeleton, generation,
                         outline, title, revision, fix, continuity, judge, validation, review, illustration)
    anthropic_adapter.py claude_code_adapter.py codex_adapter.py gemini_adapter.py ollama_adapter.py voyage_adapter.py trace.py
  pipeline/
    acquire.py           resumable scrape (cursor-driven, parallel batches)
    extract.py           drain extract queue → structured knowledge → embeddings
    consolidate.py       derive significance + promote lore relationships (deterministic, no LLM)
    assets.py            render SQLite knowledge → Markdown under knowledge/ (source projects)
    skeleton.py          reverse-engineer source plot skeleton (LLM)
    newnovel.py          seed a new-novel bible from a source (LLM)
    planning.py          draft volumes/arcs into 06_Arcs/ + approve gate (LLM)
    generation.py        THE core: brief assembly, draft/judge/auto-fix/revise/finalize, outline, handoff, reset
    validation.py        whole-novel validate + per-chapter review (LLM)
    illustrate.py        entity image gen + interactive refine (Gemini)
    embeddings.py        backfill missing prose embeddings
    manuscript.py        stitch finalized chapters → manuscript.md
    scaffold.py          copy bible_templates/ → projects/<name>/bible/
  sources/               source-site adapters (base, registry, the removed adapter, page, fetcher, text-cleaner)
  bible_templates/       the 28-file bible scaffold (frontmatter conventions live here)
  web/                   Flask browse UI (OUT OF SCOPE — replaced by the API)
data/models.yml          the model registry (kind + prices), keyed by provider/model
```

### 2.2 Core concepts

- **Project** — one novel + everything derived, isolated under `projects/<name>/`. Two kinds:
  - **source project** — an existing novel scraped and understood; knowledge in SQLite.
  - **new-novel project** — an original novel written; canon is the Markdown bible; SQLite holds runtime state (finalized chapters, summaries, jobs).
    A project is detected as new-novel iff `bible/` exists (`bible.exists()`); otherwise source.
- **Resumable by construction** — a scrape cursor, an idempotent `job` queue, upsert-by-key writes, and draft-file presence mean any command re-runs from the last completed unit without duplicating.
- **Role-routed AI** — every model call asks for work by _role_ (`extraction`, `analysis`, `planning`, `generation`, `validation`, `review`, `classification`, `embedding`, `retrieval`, `illustration`); `config.yml` maps role → `provider/model`.

### 2.3 CLI commands (complete — none may be skipped)

`--project/-p` (env fallback `$LORE_FORGE_PROJECT`) is implied on all; `--model/-M role=provider/model` (repeatable) overrides a role for one run; global `-v` raises log level.

| Command                                | Model roles                                       | What it does                                                                                                                                                               |
| -------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init -u URL` / `init -t TITLE`        | none                                              | With `--url`: route to a source adapter, persist source + cursor at ch 1 (source project). Without: scaffold the Markdown bible (new-novel).                               |
| `ingest -n N --concurrency --delay-ms` | none                                              | Scrape chapters from the cursor forward; clean HTML→Markdown; store in SQLite; enqueue an extract job each. Resumable.                                                     |
| `extract -n N -r`                      | extraction, embedding                             | Drain the extract queue: per chapter → structured knowledge → atomic upsert → best-effort embed. `-r` re-arms parked chapters. Auto-runs `consolidate` at the end.         |
| `consolidate -S N -R N`                | none                                              | Recompute entity significance (recurrence) + rebuild lore relationships from staged observations. Deterministic, idempotent.                                               |
| `assets -w NAME`                       | none                                              | Render SQLite knowledge → Markdown under `knowledge/` (source projects only).                                                                                              |
| `skeleton`                             | analysis                                          | Reverse-engineer a source's volume/arc + character-role + power-curve _shape_ (abstracted from names/world).                                                               |
| `newnovel -s SRC -i INSTR`             | analysis                                          | Seed a new-novel bible (premise/world/primary characters) from a source digest + instructions. Creates the target project + scaffold.                                      |
| `plan`                                 | planning                                          | Draft the volume/arc plan into `06_Arcs/*.md` (`status: draft`), optionally mirroring a source skeleton.                                                                   |
| `approve`                              | none                                              | Flip every arc's frontmatter `status` → `approved`. The generation gate.                                                                                                   |
| `outline -n -s -g CTX`                 | planning                                          | Draft per-chapter briefs (purpose/beats/constraints) for a batch into `briefs/`. Author edits them; `generate` expands.                                                    |
| `generate -n N -a --max-fixes`         | generation, validation, retrieval, classification | Draft the next chapters to `drafts/`. Judge each; on `[HARD]` contradiction **stop** (interactive) or **auto-fix** (`-a`) and continue.                                    |
| `revise -c N -m NOTE`                  | generation, validation, retrieval                 | Rewrite a draft to feedback; bump revision; re-judge.                                                                                                                      |
| `judge -c N`                           | validation, retrieval                             | Re-check draft(s) for contradictions; record verdict in frontmatter.                                                                                                       |
| `finalize -c N`                        | analysis, embedding                               | Commit reviewed draft(s) to canon (in order): store prose, embed, continuity write-back (planned→active, register new chars, update trackers), advance story-state cursor. |
| `prompt -c N`                          | none (retrieval if vectors)                       | Export chapter N's full canon-aware generation prompt to `handoff/` for an external AI. No generation call.                                                                |
| `import -c N -f FILE -t -s`            | none                                              | Bring external prose in as a draft (verbatim), re-entering judge/finalize.                                                                                                 |
| `illustrate -e ID -i -no-chat`         | illustration                                      | Generate an entity image (Gemini), refine in a chat loop, store to `images/` + write `image:` frontmatter pointer.                                                         |
| `validate`                             | validation                                        | Whole-novel consistency sweep vs. canon + summaries → `validation_report` (scope novel).                                                                                   |
| `review -c N`                          | review                                            | Score one finalized chapter across 7 dimensions → `validation_report` (scope chapter).                                                                                     |
| `backfill`                             | embedding                                         | Embed finalized chapters whose prose vectors are missing. Idempotent.                                                                                                      |
| `export`                               | none                                              | Stitch finalized chapters → `manuscript.md`.                                                                                                                               |
| `resume`                               | extraction, embedding                             | `ingest` to completion, then drain the extract queue.                                                                                                                      |
| `cost -g N`                            | none                                              | Estimate per-role token volume + compare every priced registry model.                                                                                                      |
| `status`                               | none                                              | Progress: source (scrape/extract/knowledge tallies) or new-novel (bible completeness, plan gate, drafts/finalized, validation).                                            |
| `reset -s STAGE -y`                    | none                                              | DANGEROUS. Roll back a stage's derived data (extract/plan/generate/all); keeps ingested chapters (source) or the authored bible (new-novel).                               |
| `browse`                               | none for reading                                  | Local Flask web UI. **OUT OF SCOPE** — the whole API replaces it.                                                                                                          |

### 2.4 Core workflows

**Workflow A (understand a source):** `init --url` → `ingest` → `extract` (→ auto `consolidate`) → `assets`/`status`/`skeleton`.

**Workflow B (write a new novel):** either hand-author the bible (`init` → edit → `approve`) or seed from a source (`skeleton` → `newnovel` → `plan` → `approve`); then `outline`(optional) → `generate` → `revise`/`judge` → `finalize` → `validate`/`review`/`export`. `prompt`/`import` handle model refusals; `illustrate` makes entity art.

### 2.5 Domain entities (source of truth for §5)

- **Chapter** — number(pk), title, url, content(Markdown prose), word_count, status(`done|failed|skipped`), note, scraped_at.
- **Entity** — id(snake_case), type(`character|faction|location|power_rule|item|concept`), name, attributes(JSON, incl. derived `significance`), first_seen_chapter(NULL = seeded/planned), status, notes, aliases[], relationships (staged then promoted).
- **Beat** — id, chapter, beat_type, summary, entities[], opens_threads[], closes_threads[].
- **Plot thread** — id, status(`open|closed`), opened/closed_chapter, summary.
- **World fact** — (category, key) unique, value, chapter.
- **Mystery** — id, question, status(`open|resolved`), opened/resolved_chapter.
- **Chapter summary** — chapter(pk), text.
- **Volume / Arc** — the top-down plan; arc has objective/conflict/payoff/start_chapter/end_chapter/ordinal/cast, `status` gate `draft→approved` (`source` for skeleton arcs).
- **Story skeleton** — character_arcs(JSON roles/tracks), power_curve(prose) — abstracted source shape.
- **Draft** — chapter, title, status(`draft|final`), revision, words, arc, summary, `state`(continuation state: time/location/cast/objective/threat/ending/facts), judge verdict+note.
- **Brief** — chapter, arc, title, body(purpose/beats/constraints Markdown).
- **Job** — id(`kind:target`), kind, target, status(`pending|in_progress|done|failed`), attempts, last_error, payload.
- **Extraction run / Validation report** — provenance + structured AI outputs.

### 2.6 SQLite schema (`storage/schema.sql`) — tables to reproduce in Postgres

`project`(singleton), `source_novel`(singleton), `novel_spec`(LEGACY, unused — **drop**), `volume`, `arc`, `story_skeleton`(singleton), `scrape_cursor`(singleton), `chapter`, `entity`, `entity_alias`, `entity_relationship`(promoted), `entity_appearance`(recurrence ledger), `relationship_observation`(staged), `beat`, `plot_thread`, `chapter_summary`, `world_fact`, `mystery`, `job`, `extraction_run`, `validation_report`.

Key idempotency rules (in `repo.py`) that MUST carry over:

- `upsert_entity` **merges** `attributes` JSON across chapters and keeps the **min** `first_seen_chapter`; aliases are insert-or-ignore.
- `upsert_*` everywhere is ON CONFLICT DO UPDATE with `COALESCE` to avoid clobbering existing non-null fields (e.g. thread `opened_chapter` keeps first, `closed_chapter` takes latest).
- `add_appearance` / `add_relationship_observation` are insert-or-ignore per (entity, chapter) / (entity, target, kind, chapter).
- `pending_jobs` orders by numeric target and excludes done + attempt-exhausted; `work_summary` classifies pending/parked by the retry budget; `rearm_jobs` resets all not-done to pending.
- `RESET_STAGES` (extract/plan/generate/all) lists child-before-parent table deletes + job kinds + whether to drop vectors; ingested chapters are never touched.

### 2.7 Markdown storage behavior (bible / drafts / briefs)

- **Bible** (`bible.py`): folders `00_Project … 11_Trackers`. Each `.md` = `---`YAML frontmatter`---` + Markdown body. **Code branches only on frontmatter; never parses body prose.** `_template.md` and `README.md` are skipped by discovery. `write_doc` uses block-style YAML, `sort_keys=False` (order preserved).
  - Entity folders: `04_Characters`, `03_Factions`, `07_Locations` — frontmatter `id/name/type/significance/status/aliases/relationships`; body is authored prose. `status`: `planned` (seeded, not on page) | `active` | `inactive` | `dead`. `origin: generated` marks write-back-created characters.
  - `06_Arcs/NN_<slug>.md` — frontmatter `id/ordinal/volume/status/chapters/start_chapter/end_chapter/cast[]`; body has goal/conflict/payoff. `approve` sets `status: approved` on all; `plan_approved` = ≥1 arc & all approved.
  - Section docs: `00_Project/vision.md` (title/genre/audience/status/source_project), `01_World/world.md`, `02_Power_System/power.md`, `05_Plot/plot.md`, `09_Story_State/state.md` (cursor: current_chapter/current_arc/current_volume), `10_AI/*` (writing_style etc.), `08_Lore/*`.
  - **Trackers** (`11_Trackers/*.md`) are Markdown **tables** the write-back upserts/appends rows into: `plot_threads.md`, `mystery_tracker.md`, `timeline.md`, `relationship_matrix.md`, `power_scaling.md`, `character_appearance.md`, `chapter_summaries.md`, plus static `glossary.md`, `foreshadowing.md`, etc. `upsert_tracker_row` keys on col 0; `append_tracker_row` dedups whole rows.
- **Drafts** (`drafts.py`): `chapter_NNNN.md` — frontmatter `chapter/title/status/revision/words/arc/summary/state`; body is prose. `state` = cleaned continuation state (only known STATE_FIELDS, stringified). `STATUS.md` + `DRAFT_STATE.md` are regenerated human indexes. `latest_state`/`summaries` scan drafts for the serial story-so-far.
- **Briefs** (`briefs.py`): `briefs/chapter_NNNN.md` — the outline tier; hand-edited; kept across a generate reset.
- **Handoff**: `handoff/chapter_NNNN.prompt.md` — paste-ready external-AI prompt. **Images**: `images/<id>.png`.

### 2.8 AI workflows (see §8 for the full migration table)

Every AI call goes through `ModelRouter` (`llm/registry.py`): resolve role→adapter/model, trace request _before_ the call, retry transient failures (HTTP 408/429/5xx, connection/timeout names) with exponential backoff (`RetryConfig`: attempts 4, backoff 1s→30s), tolerant JSON extraction (`_extract_json` scans the first balanced `{...}`), raise `ModelResponseError` on unparseable JSON (permanent, never retried). Structured output uses provider-native tool-use (Anthropic) or prompt-directive JSON (Ollama). Prompts + JSON schemas are all in `llm/prompts.py`.

### 2.9 Config / environment

- `config.py`: layered YAML (built-in defaults < root `config.yml` < `projects/<name>/config.yml`), deep-merged. `models` maps role→`{provider, model}`; validated against `data/models.yml` (each entry: `kind` ∈ `llm|embedding|image` + input/output prices). A role whose model is absent or wrong-kind raises `ConfigError`. Tuning blocks: `acquire`, `extract`, `generate`, `retry` (see §5.6 for values).
- Secrets from env only: `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `GEMINI_API_KEY`; `.env` auto-loaded. `LORE_FORGE_HOME` overrides the projects root.

### 2.10 Existing tests

269 offline pytest tests (no network/keys). Per-module: text cleaner (byte-level), adapters+PageCtx, storage repos, acquire (fake fetcher: resume+idempotency), extract (fake router: persistence+accumulation+resume), newnovel/plan (fake router: partial seed, gate), generation (fake router: gate, layout, forward progress, write-back, auto-fix), router wiring, asset renderer, cost estimator, per-project config overlay, drafts/bible parsing, validation. **Pattern to reproduce:** a fake/mocked model router injected so the whole pipeline runs deterministically offline.

### 2.11 Risks / confusing areas (read before implementing)

1. **Two project shapes share tables.** Source-project knowledge (SQLite) and new-novel canon (Markdown) overlap heavily (both have entities, arcs, threads…). The target must unify them into one relational model keyed by `project_id`, distinguished by `project.kind` and entity `origin`. Get this right or the schema fragments.
2. **The generation brief is the crown jewel.** `generation._brief` assembles a _serial, budgeted, anti-branching_ context (story-so-far summaries + established facts under a char budget, previous-chapter verbatim tail, continuation `state`, active/planned cast split, retrieval snippets). Porting it faithfully is what keeps bulk-drafted chapters on one timeline. Do not simplify.
3. **`[HARD]`/`[SOFT]` judge semantics.** `_parse_verdict`: `CONSISTENT` → clean; all-`[SOFT]` → consistent (notes kept); any `[HARD]` or untagged → contradiction (fail-closed). Auto-fix stops early when the judge repeats the same finding.
4. **Continuation `state` is load-bearing and untrusted.** Model may return `state` as a non-dict; `_state_dict` degrades to `{}`. Patches must re-verify `state.time` (a stale field poisons every later brief).
5. **Patch-first repair.** Auto-fix returns minimal find/replace edits; each `find` must occur exactly once or it falls back to a full rewrite. Byte-identical untouched prose is the correctness guarantee.
6. **Finalize is ordered + idempotent.** Chapters finalize 1..n in order; write-back reuses roster ids (no duplicate characters); trackers upsert/append idempotently.
7. **Title salvage.** Generation `title` is advisory under tool-use; missing titles are backfilled by a tiny `classification` call, then sanitized (strip "Chapter N:", reject multi-line/overlong = leaked reasoning).
8. **Best-effort everywhere.** Embeddings, retrieval, and continuity write-back are enhancements — their failure must never fail the chapter. Preserve this.
9. **Async model.** The CLI blocks; an API cannot block for a multi-minute generate. Long ops must become async jobs (§7.7).
10. **Legacy `novel_spec` table** has no writer — do not port it.

---

## 3. Reference Node.js Architecture Analysis (pulse-server)

The target MUST match these conventions.

### 3.1 Framework & runtime

- **Runtime:** Bun (`"type": "module"`). **DI/app:** `@shadow-library/app` (`ShadowFactory.create(AppModule).then(a => a.start())` in `src/main.ts`; `@Module`, `@Injectable`, `@EnableIf`). **HTTP:** `@shadow-library/fastify` (`@HttpController`, `@Get/@Post/@Patch/@Delete`, `@Params/@Body/@Query`, `@RespondFor`, `@HttpStatus`, `@ApiOperation`, `ServerError`, `@Transform`). **Shared modules:** `@shadow-library/modules` (`DatabaseModule`, `DatabaseService`, `HttpCoreModule`, pagination helpers). **DTOs/validation:** `@shadow-library/class-schema` (`@Schema`, `@Field`, `OmitType/PartialType/PickType`, `EnumType`, `Paginated`, `PaginationQuery`). **Config/logging/utils:** `@shadow-library/common` (`Config`, `Logger`, `utils`, `AppError`, `ErrorType`, `OffsetPagination`). **ORM:** `drizzle-orm` + `drizzle-kit` (Bun SQL driver `drizzle-orm/bun-sql`).

### 3.2 Folder / module pattern

```
src/
  main.ts               bootstrap ShadowFactory(AppModule)
  bootstrap.ts          Config.load(...) for every env key (declare module '@shadow-library/common' ConfigRecords)
  app.module.ts         imports [DatabaseModule, HttpRouteModule]; imports './bootstrap' for side effects
  constants.ts          export const APP_NAME
  classes/              app-error-code.ts (AppErrorCode extends ServerErrorCode), index.ts barrel
  common/               enum.dto.ts (EnumType.create from schema enums), data-transformers.ts, index.ts
  database/
    database.module.ts  CoreDatabaseModule.forRoot({ postgres: { constraintErrorMap, factory } }); export type PrimaryDatabase
    database.constants.ts constraintErrorMap: DB constraint name → ServerError(AppErrorCode)
    schemas/            one file per domain area; index.ts barrels + `export * as schema`
    index.ts            export * as schema; export *; export * from database.module
  modules/
    dynamic.modules.ts  HttpCoreModule.forRoot + FastifyModule.forRoot({ imports:[...feature modules], routePrefix:'/api', prefixVersioning, transformers })
    <feature>/
      <feature>.module.ts   @Module({ imports:[DatabaseModule], controllers, providers, exports })
      index.ts              barrel (export services + module)
      <sub>/<sub>.controller.ts  @HttpController('/path'), thin: delegates to service, throws ServerError on not-found
      <sub>/<sub>.service.ts     @Injectable, `private readonly db = databaseService.getPostgresClient()`, Drizzle queries
      <sub>/<sub>.dto.ts         @Schema request/response classes
scripts/  lint.ts build.ts create-template-db.ts migrate-db.ts seed.ts seed-data/*
generated/drizzle/     migrations + meta (drizzle-kit output)
tests/    <module>/<x>.spec.ts (bun:test), test-environment.ts, test.d.ts
drizzle.config.ts  { out:'./generated/drizzle', dialect:'postgresql', schema:'./src/database/schemas/index.ts', dbCredentials }
```

### 3.3 Controller conventions

Thin, declarative. `@ApiOperation({ tags:[...] })` on the class, `@HttpController('/resource')` (may nest: `/sender-profiles/:profileId/endpoints`). Each method: HTTP verb decorator + `@RespondFor(status, ResponseDto)` (or `@HttpStatus(204)`), typed `@Params/@Body/@Query` DTOs, returns `service.method(...)`. Not-found handling is in the controller for GETs (`if (!x) throw new ServerError(AppErrorCode.XXX)`); services throw for mutations. Dev-only routes use `@EnableIf(() => Config.get('app.stage') === 'dev')`.

### 3.4 Service conventions

`@Injectable()`; `private readonly logger = Logger.getLogger(APP_NAME, X.name)`; `private readonly db: PrimaryDatabase = databaseService.getPostgresClient()`. Drizzle relational queries (`db.query.table.findFirst/findMany({ where, with, orderBy, limit, offset })`) and builder (`db.insert/update/delete(...).returning()`). `.catch(err => this.databaseService.translateError(err))` maps constraint violations to `ServerError`. `assert(row, 'msg')` after insert. Pagination via `utils.pagination.normalise(filter, { mode:'offset', defaults })` + `utils.pagination.createResult(query, items, total)`. `bigint` ids throughout. Cross-module deps injected (e.g. NotificationService injects TemplateVariantService, SenderEndpointService…).

### 3.5 DTO / validation conventions

`@Schema()` classes with `@Field()`. `@Field(() => EnumType)` for enums, `@Field(() => String, { format:'date-time' })` for dates, `@Field(() => String, { pattern:'^[0-9]+$' }) @Transform('bigint:parse')` for bigint path params. Composition via `OmitType/PartialType/PickType`. `@Schema({ minProperties:1 })` for PATCH bodies. List responses `extends Paginated(ItemResponse)`; list queries `extends PaginationQuery(SortByTime)`. Enum DTOs created in `common/enum.dto.ts` from Drizzle enum `enumValues`.

### 3.6 Error handling

`AppErrorCode extends ServerErrorCode` (in `classes/app-error-code.ts`): `static readonly CODE = new AppErrorCode('CODE', ErrorType.NOT_FOUND|CONFLICT|CLIENT_ERROR, 'message')`. Grouped by domain with `/*! ... */` banners. `throw new ServerError(AppErrorCode.CODE)`. DB constraint names → codes in `database.constants.ts`. Error response shaped by the `server-error:toObject` transformer → `{ code, type, message }`.

### 3.7 Logging / config / DB / migrations / testing

- **Logging:** `Logger.getLogger(APP_NAME, ClassName)`; `.info/.debug/.error`; structured metadata objects; `no console` (eslint). `utils.string.mask` for PII.
- **Config:** `Config.load(key, { defaultValue, validateType, allowedValues, isProdRequired })` in `bootstrap.ts`, typed via `declare module '@shadow-library/common' { interface ConfigRecords }`. Read with `Config.get(key)`; `Config.isProd()/isDev()`.
- **DB:** Drizzle over Bun SQL; `pgTable`, `pgEnum`, `bigserial/bigint({mode:'bigint'})/uuid/varchar/boolean/smallint/timestamp/jsonb/index/unique`; `relations(...)`; namespaced type exports (`export namespace Notification { export type Job = InferSelectModel<...> }`). `defaultRandom()` uuid pks or `bigserial` pks. `.references(() => other.id, { onDelete:'cascade'|'restrict' })`.
- **Migrations:** authored by `drizzle-kit generate` into `generated/drizzle/`; applied by `scripts/migrate-db.ts` (`migrate(drizzle(url), { migrationsFolder })`). A **template DB** (`create-template-db.ts`) migrates + seeds once, marked `IS_TEMPLATE`; each test spec clones it (`CREATE DATABASE x TEMPLATE tmpl`).
- **Testing:** `bun:test`; `TestEnvironment` clones the template DB per spec, boots `ShadowApplication(AppModule)`, mocks the long-running executor (`NotificationService.prototype['executeNotificationJob'] = () => Bun.sleep(10)`), exposes `getRouter()` (`Router.mockRequest()`) and `getPostgresClient()`. Specs mirror module structure under `tests/`.

### 3.8 Provider abstraction (the model for our AI providers)

`NotificationProviderService` picks a concrete provider (`DevNotificationProvider`) by `senderEndpoint.provider`; provider **interfaces** (`SMSProvider/EmailProvider/PushNotificationProvider`) + a `NotificationOpResult` union (`{success:true} | {success:false, retriable, error}`) live in `providers/base-notification.provider.ts`. Template rendering via `mustache.render`. Failover/retry (attempt, `nextAttemptAt` with exponential backoff + jitter, `MAX_ATTEMPTS`, `PERMANENTLY_FAILED`) lives in the service and the `notification_jobs` table. **This is the exact shape our AI-provider + job-queue layer should take.**

### 3.9 Target repo current state (what exists / is missing)

Present: the pulse template renamed — `main.ts`, `app.module.ts`, `bootstrap.ts` (still MongoDB-flavored: `db.uri` default `mongodb://…` — REPLACE), `routes/routes.module.ts` (bare `FastifyModule.forRoot({ imports:[HttpCoreModule.forRoot()] })`), `classes/app-error-code.ts`, one trivial `tests/server.spec.ts`, `tsconfig.json` (path alias only `@server/*`). **Missing (must add):** `DatabaseModule`, `database/schemas`, `drizzle.config.ts`, `generated/drizzle`, `common/`, `constants.ts`, `modules/` + `dynamic.modules.ts`, DB scripts, `test-environment.ts`, and the extra path aliases (`@modules`, `@scripts`, `@tests`). **Dependencies are older than pulse** (`@shadow-library/app ^1.2.0` vs `^1.3.2`, `class-schema ^0.0.12` vs `^0.4.2`, `modules ^0.1.1` vs `^0.6.0`) — bump to match pulse-server, and add `drizzle-orm`, `drizzle-kit`, plus the AI stack (§8.0).

---

## 4. Migration Map

Legend risk: 🟢 mechanical · 🟡 needs care · 🔴 high (core logic / correctness).

| Python (file · symbol)                                           | Responsibility                                       | Target module / file                                                                             | Service / repo / controller                             | Notes                                                                                                                                                                                                                            | Risk |
| ---------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `cli.py` (Typer app)                                             | Command surface                                      | `modules/**/**.controller.ts`                                                                    | all controllers                                         | Each command → one or more REST endpoints (§7). No CLI.                                                                                                                                                                          | 🟡   |
| `project.py` `Project`                                           | Per-project isolation, paths, conn                   | `modules/project/project.service.ts` + `projects` table                                          | ProjectService                                          | "Project" becomes a DB row; `project_id` FK everywhere. Paths (drafts/handoff/images) become tables/columns.                                                                                                                     | 🔴   |
| `config.py` `Config`/registry                                    | role→model map, tuning, models.yml                   | `modules/ai/model-registry.*` + `config.jsonb` on project + `bootstrap.ts`                       | ModelRegistryService, AiConfigService                   | Registry → a TS const (`ai/models.ts`). Per-project overrides → `projects.config` jsonb deep-merged over defaults. Keys via `Config.load`.                                                                                       | 🟡   |
| `costing.py`                                                     | per-role cost estimate                               | `modules/ai/costing.service.ts`                                                                  | CostingService                                          | Pure function over registry + corpus stats.                                                                                                                                                                                      | 🟢   |
| `storage/db.py`,`schema.sql`,`repo.py`                           | SQLite + all SQL                                     | `database/schemas/*` + per-module services                                                       | DatabaseService (framework)                             | Reproduce every table + idempotent upsert semantics in Drizzle.                                                                                                                                                                  | 🔴   |
| `storage/vectors.py` (LanceDB)                                   | prose-chunk embeddings + search                      | `modules/ai/retrieval.service.ts` (LlamaIndex + pgvector)                                        | RetrievalService                                        | `chapter_chunks` becomes a pgvector table; add/search/reset/embedded map over.                                                                                                                                                   | 🟡   |
| `bible.py`                                                       | Markdown canon reader/writer + trackers              | normalized tables (`entities`,`volumes`,`bible_documents`,`plot_threads`,…) + `modules/bible/*`  | BibleService, entity/volume services                    | The biggest transform: frontmatter→columns, body→text, tracker tables→real tables. Arc→Volume (§1.1.16).                                                                                                                         | 🔴   |
| `drafts.py`                                                      | draft files + STATUS/DRAFT_STATE                     | `drafts` table + `modules/generation/draft.service.ts`                                           | DraftService                                            | STATUS.md/DRAFT_STATE.md are derived views (a GET endpoint), not files. `state` → jsonb.                                                                                                                                         | 🟡   |
| `briefs.py`                                                      | outline briefs                                       | `briefs` table + `modules/generation/brief.service.ts`                                           | BriefService                                            |                                                                                                                                                                                                                                  | 🟢   |
| `pipeline/acquire.py`                                            | resumable scrape                                     | `modules/source/acquire.service.ts` + `sources/*`                                                | (ported, later removed)                                 | Port fetcher + adapters + text cleaner; cursor→`projects` columns. Runs as a job.                                                                                                                                                | 🔴   |
| `sources/*` (adapters, text cleaner)                             | HTML→Markdown, site adapters                         | `modules/source/adapters/*`, `source/text-cleaner.ts`                                            | (registry)                                              | `text.py` is byte-sensitive — port with byte-level tests.                                                                                                                                                                        | 🔴   |
| `pipeline/extract.py`                                            | queue drain → knowledge → embed                      | `modules/extraction/extraction.service.ts` (+ LangChain)                                         | ExtractionService                                       | Idempotent persist in a txn; enqueue via jobs.                                                                                                                                                                                   | 🔴   |
| `pipeline/consolidate.py`                                        | significance + relationship promotion                | `modules/extraction/consolidate.service.ts`                                                      | ConsolidateService                                      | Deterministic; port synonym/structural/symmetric/inverse maps verbatim.                                                                                                                                                          | 🟡   |
| `pipeline/assets.py`                                             | knowledge→Markdown                                   | `modules/source/asset.service.ts` (returns Markdown string)                                      | AssetService                                            | Render on demand to a string/response, not files.                                                                                                                                                                                | 🟢   |
| `pipeline/skeleton.py`                                           | reverse-engineer shape                               | `modules/planning/skeleton.service.ts` (LangChain)                                               | SkeletonService                                         |                                                                                                                                                                                                                                  | 🟡   |
| `pipeline/newnovel.py`                                           | seed new-novel bible                                 | `modules/planning/newnovel.service.ts` (LangChain)                                               | NewNovelService                                         | Writes normalized bible rows instead of Markdown.                                                                                                                                                                                | 🟡   |
| `pipeline/planning.py`                                           | volume plan + approve                                | `modules/planning/planning.service.ts` (LangChain)                                               | PlanningService                                         | Single-tier `volumes` rows `status draft→approved` (arc→Volume, §1.1.16).                                                                                                                                                        | 🟡   |
| `pipeline/generation.py`                                         | draft/judge/auto-fix/revise/finalize/outline/handoff | `modules/generation/*` (LangGraph + LangChain)                                                   | GenerationService, JudgeService, FinalizeService, graph | The core. Auto-fix loop = LangGraph. Brief assembly = pure service.                                                                                                                                                              | 🔴   |
| `pipeline/validation.py`                                         | validate + review                                    | `modules/validation/validation.service.ts` (LangChain)                                           | ValidationService                                       | Persist `validation_reports`.                                                                                                                                                                                                    | 🟡   |
| `pipeline/illustrate.py`                                         | entity image + refine                                | `modules/illustration/illustration.service.ts`                                                   | IllustrationService                                     | **OpenAI** image gen (was Gemini). Interactive loop → session (id + preview endpoints). Bytes persisted via the swappable `IMAGE_STORAGE` provider (local folder now).                                                           | 🟡   |
| `pipeline/embeddings.py`                                         | backfill                                             | `modules/ai/retrieval.service.ts#backfill`                                                       | RetrievalService                                        |                                                                                                                                                                                                                                  | 🟢   |
| `pipeline/manuscript.py`                                         | stitch manuscript                                    | `modules/generation/manuscript.service.ts`                                                       | ManuscriptService                                       | Return assembled Markdown.                                                                                                                                                                                                       | 🟢   |
| `pipeline/scaffold.py`                                           | copy bible templates                                 | `modules/planning/scaffold.service.ts`                                                           | ScaffoldService                                         | Seed default bible_documents rows for a new-novel project (no file copy).                                                                                                                                                        | 🟡   |
| `llm/base.py`,`registry.py`,`adapters/*`,`prompts.py`,`trace.py` | provider-agnostic AI + retry + tracing               | `modules/ai/*` (LangChain chat models, `ai/prompts/*`, `ai/schemas/*`)                           | ModelRouterService, ConcurrencyController               | Router → resolve role to a LangChain `ChatModel`; providers: `anthropic`,`openai`,`ollama`,`anthropic-claude-code`,`openai-codex` (env/config-gated); retry via `withRetry`; trace → `extraction_runs`/logs; serialize per §9.2. | 🔴   |
| `image storage` (new)                                            | persist illustration bytes                           | `modules/storage/*` (`IMAGE_STORAGE` token, `ImageStorageProvider`, `LocalImageStorageProvider`) | ImageStorage (DI)                                       | Swappable provider (local folder now, cloud later) — one module change to swap.                                                                                                                                                  | 🟡   |
| `web/*` (Flask)                                                  | browse UI                                            | —                                                                                                | —                                                       | OUT OF SCOPE. Replaced by the API + (future) a separate frontend.                                                                                                                                                                | —    |
| `logging_config.py`                                              | structlog                                            | framework `Logger`                                                                               | —                                                       | Drop; use `@shadow-library/common` Logger.                                                                                                                                                                                       | 🟢   |

---

## 5. Target Domain Model (TypeScript)

Types are `InferSelectModel<typeof table>` in Drizzle namespaces (§6). This section defines the conceptual model + DTOs + enums + rules.

### 5.1 Enums (`common/enum.dto.ts`, from Drizzle `pgEnum`)

- `ProjectKind` = `source | new_novel`
- `ChapterStatus` = `done | failed | skipped`
- `EntityType` = `character | faction | location | power_rule | item | concept`
- `EntitySignificance` = `major | minor`
- `EntityStatus` = `planned | active | inactive | dead` (bible) / free text for source (store as varchar; validate loosely)
- `EntityOrigin` = `extracted | seeded | generated`
- `PlanStatus` = `draft | approved | source`
- `ThreadStatus` = `open | closed`
- `MysteryStatus` = `open | resolved`
- `DraftStatus` = `draft | final`
- `JudgeVerdict` = `consistent | contradiction`
- `JobKind` = `ingest | extract | generate | finalize` (extensible)
- `JobStatus` = `pending | in_progress | done | failed`
- `ValidationScope` = `novel | chapter`
- `BibleSection` = `project | world | power | plot | story_state | ai | lore` (free-prose sections only; entities/volumes/factions/locations are their own tables)
- `AiRole` = `extraction | analysis | planning | generation | validation | review | classification | embedding | retrieval | illustration`
- `AiProvider` = `anthropic | openai | ollama | xai | anthropic-claude-code | openai-codex`
- `ContentMode` = `standard | grok_only` (per-project; `grok_only` = adult/uncensored, all roles → xAI, §8.5)
- `ContentGenerator` = `standard | grok` (per-chapter: which model wrote it; `grok` = human-reviewed interlude, §8.6)
- `ContinuityProposalStatus` = `pending | applied | discarded` (staged, human-editable bible write-back, §8.6)

### 5.2 Entities & relationships (conceptual)

```
Project 1─┬─* Chapter
          ├─* Entity ─1─* EntityAlias
          │            └1─* EntityRelationship (promoted)   ⟵ ConsolidateService
          │            └1─* EntityAppearance (recurrence ledger)
          │            └1─* RelationshipObservation (staged)
          ├─* Volume  (single planning unit — was Python "arc"; §1.1.16)
          ├─1 StorySkeleton (nullable; source projects)
          ├─* Beat, PlotThread, WorldFact, Mystery, TimelineEvent, PowerProgression
          ├─* BibleDocument (free-prose sections)
          ├─* Draft ─(finalize)→ Chapter
          ├─* Brief
          ├─* Job
          ├─* ExtractionRun
          ├─* ValidationReport
          └─* ChapterChunk (pgvector embeddings)
```

- **Chapter.summary** is a column (fold the SQLite `chapter_summary` table into `chapters`). Source-project chapters carry `content` + `summary`; new-novel finalized chapters likewise.
- **Entity** unifies source knowledge and new-novel bible. `origin` distinguishes `extracted` (source), `seeded` (newnovel `status: planned`), `generated` (finalize write-back). `body` (text) holds authored bible prose (characters/factions/locations); NULL for source entities. `imagePath` holds the illustration pointer.
- **Volume.cast** is `jsonb` (array of entity keys); **Volume.body** holds the volume's authored prose (goal/conflict/payoff). A Volume is the single plan unit (§1.1.16); chapters map to volumes deterministically.
- **Draft.state** is `jsonb` (continuation state); `Draft.judgeNote` text.

### 5.3 DTOs (per §7 endpoints)

Follow pulse patterns: `Create*Body`, `Update*Body extends PartialType(OmitType(...))` with `@Schema({minProperties:1})`, `*Response` (dates as `@Field(() => String, {format:'date-time'})`, bigint ids as `@Field(() => String)`), `List*Query extends PaginationQuery(SortByTime)`, `List*Response extends Paginated(*Response)`, path params `@Field(()=>String,{pattern:'^[0-9]+$'}) @Transform('bigint:parse')`. Enum fields `@Field(() => EnumType)`.

### 5.4 Value objects

- **ContinuationState** (`Draft.state` jsonb): `{ time?, location?, cast?: string[], objective?, threat?, ending?, facts?: string[] }` — cleaned to known fields only, all stringified (`drafts._clean_state`).
- **ModelRef**: `{ provider: string, model: string }`.
- **BriefContext / Canon** — assembled strings (not persisted).

### 5.5 State transitions (preserve exactly)

- **Scrape:** cursor advances only after a chapter is persisted; 404 → `complete`; transient error → stop without completing (resume re-enters).
- **Extract job:** `pending → in_progress → done | failed(+attempt)`; `failed` re-armable; parked = attempts ≥ max.
- **Plan gate:** Volume `draft → approved` (via approve); generation blocked until all volumes approved.
- **Chapter (new-novel):** brief → draft (`draft`) → [judge: consistent|contradiction] → revise (rev++) → finalize (`final`, in order) → canon + bible write-back (planned→active, register generated, trackers). Story-state cursor advances to `n`.
- **Grok interlude chapter (§8.6):** `generate-grok` → draft (`generator:grok`, no auto-judge) → **human review** / hand-edit → finalize (`final`) → canon prose + summary + state **only** (no write-back, no embed; `continuityApplied=false`). Optional: propose-continuity (Grok) → proposal `pending` → human edit → apply (`applied`, `continuityApplied=true`, bible mutated) **or** discard (`discarded`, no change).
- **Entity significance:** minor↔major re-derived from recurrence each consolidate (idempotent).
- **Auto-fix:** contradiction → patch|rewrite → re-judge, loop ≤ max_fixes, stop early on repeated finding; then accept.

### 5.6 Validation rules / tuning defaults (from `config.py`, keep as constants/config)

`acquire`: concurrency 6, delay_ms 300. `extract`: chunk_chars 2000, max_attempts 3, significance_min_chapters 3, relationship_min_chapters 3, roster_max 200. `generate`: chapters_per_volume 5 (was `chapters_per_arc`; §1.1.16), target_words 2000, retrieval_k 6, max_tokens 8000, max_attempts 3, continuity true, judge true, prev_tail_chars 1000, memory_chars 6000, full_cast_max 12, brief_batch 10. `retry`: attempts 4, backoff_seconds 1.0, backoff_max 30.0. Trim caps in generation: `_TRIM_LONG 1500`, `_TRIM_MED 900`, `_RECENT_SUMMARIES 4`.

---

## 6. PostgreSQL Schema Design

**Conventions:** Drizzle `pgTable`, snake_case columns / camelCase TS. Primary keys: `bigserial('id',{mode:'bigint'})` (or `uuid` for jobs). Every non-project table has `projectId bigint NOT NULL references(projects.id, {onDelete:'cascade'})`. Timestamps `createdAt/updatedAt timestamp notNull defaultNow()`. Enums via `pgEnum`. Namespaced type exports per file. `relations(...)` for query joins. **JSONB only where genuinely heterogeneous** (attributes, themes, cast, state, payload, beat arrays, raw AI output). One schema file per domain area; `schemas/index.ts` barrels all.

### 6.1 `schemas/projects.ts`

`projectKind = pgEnum(['source','new_novel'])`

**projects** — folds the SQLite singletons (`project`, `source_novel`, `scrape_cursor`, `story_skeleton`, `novel_spec`→dropped, story-state cursor) into one row (all were 1:1 per project):

- `id bigserial pk`, `ownerId bigint` (**nullable, unused now — auth-ready seam, decision §1.1.2**), `name varchar(255) notNull unique`, `kind projectKind notNull`, `title varchar(500)`
- source (columns later dropped when the acquisition pipeline was removed): a source URL, an adapter identifier, and a source novel id (all varchar)
- new-novel seed: `brief text` (**the user's high-level "what the novel is about" — input for full-bible generation + clone A/B, §8.7**), `premise text`, `themes jsonb`, `instructions text`, `sourceProjectId bigint references(projects.id)` (nullable self-ref: which source it derived from)
- scrape cursor (columns later dropped when the acquisition pipeline was removed): a next-URL field, a next-chapter-number counter (default 1), and a completion flag (default false)
- story-state cursor: `storyCurrentChapter integer default 0`, `storyCurrentVolumeKey varchar` (the Volume the current chapter belongs to — §1.1.16; single-tier, so no separate arc/volume columns)
- skeleton: `skeletonCharacterArcs jsonb` (**character** arcs = development journeys, name kept — §1.1.16), `skeletonPowerCurve text`
- `contentMode` (`pgEnum ['standard','grok_only']`, notNull default `'standard'`) — `grok_only` forces every role to xAI and disables embeddings (§8.5)
- `config jsonb` (per-project role/model + tuning overrides, deep-merged over defaults)
- `createdAt`, `updatedAt`

### 6.2 `schemas/chapters.ts`

`chapterStatus = pgEnum(['done','failed','skipped'])`

**chapters** — `id bigserial pk`, `projectId`, `number integer notNull`, `title varchar(500)`, `content text`, `summary text`, `wordCount integer`, `status chapterStatus notNull`, `generator contentGenerator notNull default 'standard'` (§8.6), `continuityApplied boolean notNull default false` (was the bible write-back done — always true for standard finalize; false for grok chapters until promoted), `note text`, timestamps (a source-page URL and a scrape timestamp were also tracked here; both columns were later dropped when the acquisition pipeline was removed). **unique(projectId, number)**. index(projectId, status).

### 6.3 `schemas/knowledge.ts` (entities + graph)

`entityType`, `entitySignificance`, `entityOrigin` pgEnums.

- **entities** — `id bigserial pk`, `projectId`, `entityKey varchar notNull` (the snake_case model id), `type entityType notNull`, `name varchar notNull`, `attributes jsonb`, `significance entitySignificance`, `firstSeenChapter integer` (NULL = planned/seeded), `status varchar`, `origin entityOrigin`, `notes text`, `motivation text`, `body text` (authored bible prose), `imagePath varchar`, timestamps. **unique(projectId, entityKey)**. index(projectId, type).
- **entityAliases** — `entityId bigint references(entities.id,cascade)`, `alias varchar`. **pk(entityId, alias)**.
- **entityRelationships** (promoted) — `id bigserial pk`, `projectId`, `entityId bigint→entities`, `targetKey varchar`, `kind varchar notNull`, `note text`, `chapter integer`. **unique(projectId, entityId, targetKey, kind, chapter)**.
- **entityAppearances** (recurrence ledger) — `projectId`, `entityId→entities(cascade)`, `chapter integer`, plus write-back cols `firstChapter integer`, `lastChapter integer`, `seenChapters jsonb`. **pk(entityId, chapter)**. (Absorbs the `character_appearance.md` tracker.)
- **relationshipObservations** (staged) — `projectId`, `entityId→entities(cascade)`, `targetKey varchar`, `kind varchar`, `chapter integer`, `note text`. **pk(entityId, targetKey, kind, chapter)**. (targetKey is NOT an FK — target may precede its entity.)

### 6.4 `schemas/plan.ts` (volumes — single-tier plan, §1.1.16)

`planStatus = pgEnum(['draft','approved','source'])`

The Python two-tier volume→arc is **flattened to one table**: a **Volume** is the unit chapters hang on (the Python "arc" renamed). There is no separate grouping table.

- **volumes** — `id bigserial pk`, `projectId`, `volumeKey varchar notNull` (stable snake_case id — was `arcKey`), `ordinal integer notNull default 0` (reading order, 1,2,3…), `title`, `objective text`, `conflict text`, `payoff text`, `startChapter integer`, `endChapter integer` (contiguous span, laid out deterministically from `chapters_per_volume`), `status planStatus notNull default 'draft'` (generation gate), `cast jsonb`, `body text` (authored goal/conflict/payoff prose), timestamps. **unique(projectId, volumeKey)**. index(projectId, ordinal).

### 6.5 `schemas/story.ts` (beats / threads / world / mysteries / timeline / power)

- **beats** — `id bigserial pk`, `projectId`, `beatKey varchar notNull`, `chapter integer notNull`, `beatType varchar`, `summary text`, `entities jsonb`, `opensThreads jsonb`, `closesThreads jsonb`. **unique(projectId, beatKey)**. index(projectId, chapter).
- **plotThreads** — `id bigserial pk`, `projectId`, `threadKey varchar notNull`, `status threadStatus notNull`, `openedChapter integer`, `closedChapter integer`, `summary text`, `owner varchar`, `payoff text`. **unique(projectId, threadKey)**.
- **worldFacts** — `id bigserial pk`, `projectId`, `category varchar notNull`, `key varchar notNull`, `value text notNull`, `chapter integer`. **unique(projectId, category, key)**. index(projectId, category).
- **mysteries** — `id bigserial pk`, `projectId`, `mysteryKey varchar notNull`, `question text notNull`, `status mysteryStatus notNull`, `openedChapter integer`, `resolvedChapter integer`, `knownTo varchar`. **unique(projectId, mysteryKey)**.
- **timelineEvents** — `id bigserial pk`, `projectId`, `whenText varchar`, `event text notNull`, `chapter integer`, `significance text`. (timeline.md tracker.)
- **powerProgressions** — `id bigserial pk`, `projectId`, `character varchar`, `stage varchar`, `chapter integer`, `feat text`, `next text`. **unique(projectId, character, chapter)**. (power_scaling.md tracker.)

### 6.6 `schemas/bible.ts`

`bibleSection = pgEnum(['project','world','power','plot','story_state','ai','lore'])`

- **bibleDocuments** — `id bigserial pk`, `projectId`, `section bibleSection notNull`, `slug varchar notNull` (e.g. `vision`, `world`, `power`, `plot`, `state`, `writing_style`), `frontmatter jsonb`, `body text`, timestamps. **unique(projectId, section, slug)**. Holds only genuinely free-prose sections; entities/volumes/trackers are their own tables. Story-state cursor lives on `projects`, not here (the `state.md` body may still be a bibleDocument for prose).

### 6.7 `schemas/generation.ts` (drafts / briefs)

`draftStatus = pgEnum(['draft','final'])`, `judgeVerdict = pgEnum(['consistent','contradiction'])`

- **drafts** — `id bigserial pk`, `projectId`, `chapter integer notNull`, `title varchar(500)`, `status draftStatus notNull default 'draft'`, `revision integer notNull default 0`, `words integer`, `volumeKey varchar` (was `arcKey`; §1.1.16), `summary text`, `body text notNull`, `state jsonb`, `generator contentGenerator notNull default 'standard'` (§8.6 — `grok` ⇒ human-reviewed, no auto-judge), `judge judgeVerdict` (null for grok drafts — human review), `judgeNote text`, timestamps. **unique(projectId, chapter)**.
- **briefs** — `id bigserial pk`, `projectId`, `chapter integer notNull`, `volumeKey varchar` (was `arcKey`; §1.1.16), `title varchar`, `body text notNull`, timestamps. **unique(projectId, chapter)**.
- **continuityProposals** — `id bigserial pk`, `projectId`, `chapter integer notNull`, `status continuityProposalStatus notNull default 'pending'`, `proposal jsonb notNull` (the Grok CONTINUITY delta — appeared/new_characters/threads/mysteries/timeline/relationships/power — **human-editable before apply**), `model varchar`, `appliedAt timestamp`, timestamps. **unique(projectId, chapter)** (re-proposing upserts the pending row). Staged, human-reviewed bible write-back for grok chapters (§8.6).

### 6.8 `schemas/jobs.ts` (work queue + provenance + reports)

`jobKind`, `jobStatus`, `validationScope` pgEnums.

- **jobs** — `id uuid defaultRandom pk`, `projectId`, `kind jobKind notNull`, `target varchar notNull`, `status jobStatus notNull default 'pending'`, `attempts smallint notNull default 0`, `lastError varchar(2000)`, `payload jsonb`, `progress jsonb` (**live progress `{ done, total, current, phase }`, updated incrementally — §7.7**), `nextAttemptAt timestamp`, timestamps. **unique(projectId, kind, target)** (mirrors `job.id = "kind:target"`). index(projectId, kind, status).
- **extractionRuns** — `id bigserial pk`, `projectId`, `chapter integer`, `role varchar`, `model varchar`, `status varchar` (`ok|error`), `rawJson jsonb`, `createdAt`. index(projectId, chapter).
- **validationReports** — `id bigserial pk`, `projectId`, `scope validationScope notNull`, `chapter integer`, `issues integer notNull`, `summary text`, `payload jsonb notNull`, `createdAt`. index(projectId, scope, chapter).

### 6.9 `schemas/vectors.ts` (pgvector — replaces LanceDB)

Enable `CREATE EXTENSION IF NOT EXISTS vector;` (first migration, hand-added SQL). Managed via LlamaIndex's `PGVectorStore` but declare a Drizzle table for reset/backfill bookkeeping:

- **chapterChunks** — `id bigserial pk`, `projectId`, `chapter integer notNull`, `chunkIdx integer notNull`, `text text notNull`, `embedding vector(1024)` (**`ollama/qwen3-embedding:8b`** truncated to **1024** dims; `EMBEDDING_DIM=1024` migration/config constant). index HNSW/IVFFlat on `embedding`. index(projectId, chapter). Delete-by-(projectId,chapter) before re-add for idempotency (mirrors `vectors.add_chapter_chunks`). **`grok_only` projects write no chunks** (embeddings disabled — §8.5).

> Use `drizzle-orm/pg-core`'s custom type or `pgvector` drizzle helper for `vector`. If LlamaIndex owns the table shape, align the Drizzle declaration to it and only use Drizzle for delete/count/`embedded_chapters`.

### 6.10 Normalization decisions

- **Fold singletons into `projects`** (source, cursor, story-state, skeleton) — all were `id=1` singletons; 1:1 denormalization is justified and removes 4 tables.
- **Fold `chapter_summary` into `chapters.summary`** — always 1:1 with a chapter.
- **Fold trackers into real tables** — `character_appearance`→`entityAppearances` cols; `timeline`→`timelineEvents`; `power_scaling`→`powerProgressions`; `plot_threads`/`mystery_tracker`/`relationship_matrix`/`chapter_summaries` map to `plotThreads`/`mysteries`/`entityRelationships`/`chapters.summary`. Static trackers with no writer (`glossary`, `foreshadowing`, `consistency_checklist`) → `bibleDocuments` rows.
- **Drop** `novel_spec` (legacy, no writer). **Keep JSONB** for `attributes/themes/cast/state/payload/beat-arrays/rawJson` (heterogeneous by design).
- **Multi-tenancy:** row-level by `projectId` replaces per-file isolation; add `projectId` to every unique constraint.

### 6.11 Migration files

`drizzle-kit generate` names them; expect `generated/drizzle/0000_init.sql` (extension + all tables). Add a **hand-written pre-step** in the first migration (or a separate `0000_pgvector.sql`) for `CREATE EXTENSION vector`. Regenerate meta via drizzle-kit; never hand-edit `meta/`.

---

## 7. API Design

Base: `/api`, `prefixVersioning` (so `/api/v1/...`). All ids are bigint path params (`@Transform('bigint:parse')`). Errors → `AppErrorCode` (§ own codes). Long-running ops return a **Job** (202) and are polled (§7.7). No auth in scope (single-operator tool) — add a note where a future API key would gate mutations. Group into modules mirroring pulse.

### 7.1 Projects module (`/projects`)

| Verb   | Route                  | Body/Query                                                        | Response                    | Service                 | Notes                                                                                                                                                                                      |
| ------ | ---------------------- | ----------------------------------------------------------------- | --------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST   | `/projects`            | `CreateProjectBody { name, kind, url?, title?, contentMode? }`    | 201 `ProjectResponse`       | ProjectService.create   | `kind=source` needs `url` (route to adapter, set cursor); `kind=new_novel` scaffolds default bible rows. `contentMode=grok_only` requires `ai.xaiApiKey` (else `AI_003`). Replaces `init`. |
| GET    | `/projects`            | `ListProjectsQuery`                                               | 200 `ListProjectResponse`   | list                    |                                                                                                                                                                                            |
| GET    | `/projects/:id`        | —                                                                 | 200 `ProjectResponse`       | get                     | 404 `PRJ_001`.                                                                                                                                                                             |
| GET    | `/projects/:id/status` | —                                                                 | 200 `ProjectStatusResponse` | status                  | Shape-aware (source vs new-novel), mirrors `_status_*`. Replaces `status`.                                                                                                                 |
| PATCH  | `/projects/:id`        | `UpdateProjectBody { title?, config?, contentMode? }`             | 200                         | update                  | **Novel settings (§1.1.14):** rename; reassign any role's model **anytime** (takes effect next op); reject moving a Grok-locked role off `xai` (`AI_003`).                                 |
| POST   | `/projects/:id/clone`  | `CloneProjectBody { name, config?, contentMode?, resetDerived? }` | 201 `ProjectResponse`       | ProjectService.clone    | **§1.1.15** — deep-copy for model A/B on the same input. `resetDerived` default true (inputs only).                                                                                        |
| DELETE | `/projects/:id`        | —                                                                 | 204                         | remove                  | Cascades.                                                                                                                                                                                  |
| POST   | `/projects/:id/reset`  | `ResetBody { stage: extract                                       | plan                        | generate                | all }`                                                                                                                                                                                     | 200 `ResetResponse` | reset | DANGEROUS. Mirrors `reset` semantics per shape. |
| GET    | `/projects/:id/cost`   | `?generateChapters=N`                                             | 200 `CostResponse`          | CostingService.estimate | Replaces `cost`.                                                                                                                                                                           |

### 7.2 Source module (`/projects/:id/source/...`)

| Verb   | Route                                                                                  | Body                                               | Response                           | Service                               |
| ------ | -------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------- | ------------------------------------- |
| POST   | `/ingest`                                                                              | `IngestBody { limit?, concurrency?, delayMs? }`    | 202 `JobResponse`                  | (job `ingest`, later removed)         |
| POST   | `/extract`                                                                             | `ExtractBody { limit?, retryFailed? }`             | 202 `JobResponse`                  | ExtractionService (job `extract`)     |
| POST   | `/consolidate`                                                                         | `{ significanceChapters?, relationshipChapters? }` | 200 `ConsolidateResponse`          | ConsolidateService (sync, no LLM)     |
| POST   | `/resume`                                                                              | —                                                  | 202 `JobResponse`                  | (ingest→extract chain, later removed) |
| POST   | `/skeleton`                                                                            | —                                                  | 200 `SkeletonResponse`             | SkeletonService (LLM)                 |
| GET    | `/assets`                                                                              | `?which=NAME`                                      | 200 `AssetResponse { markdown }`   | AssetService (returns string)         |
| GET    | `/chapters`                                                                            | `ListChaptersQuery`                                | 200 `ListChapterResponse`          | ChapterService (no prose in list)     |
| GET    | `/chapters/:n`                                                                         | —                                                  | 200 `ChapterResponse` (+knowledge) | get                                   |
| PATCH  | `/chapters/:n`                                                                         | `{ title?, content }`                              | 200                                | update editor text                    |
| DELETE | `/chapters/:n`                                                                         | —                                                  | 204                                | delete + per-chapter knowledge        |
| GET    | `/knowledge/entities` `/relationships` `/threads` `/world-facts` `/mysteries` `/beats` | paginated                                          | 200 lists                          | reads                                 |

### 7.3 Planning module (`/projects/:id/...`)

| Verb                  | Route                               | Body                                             | Response                            | Service                                                                                                                      |
| --------------------- | ----------------------------------- | ------------------------------------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| POST                  | `/seed-from-brief`                  | `{ brief, force? }`                              | 202 `JobResponse`                   | BibleBuilderService (LangGraph) — **fills the entire bible from the high-level brief (§8.7)**; `force` overwrites hand-edits |
| POST                  | `/seed`                             | `NewNovelBody { sourceProjectId, instructions }` | 200 `SeedResponse`                  | NewNovelService (LLM) — from a source, replaces `newnovel`                                                                   |
| POST                  | `/plan`                             | —                                                | 200 `PlanResponse`                  | PlanningService.plan (LLM)                                                                                                   |
| POST                  | `/approve`                          | —                                                | 200 `{ volumesApproved, approved }` | PlanningService.approve                                                                                                      |
| GET/POST/PATCH/DELETE | `/volumes`, `/volumes/:volumeKey`   | volume CRUD DTOs                                 | volume responses                    | VolumeService (hand-authoring the single-tier plan, §1.1.16)                                                                 |
| GET/PUT               | `/bible/:section/:slug`             | `{ frontmatter?, body }`                         | doc responses                       | BibleService (edit vision/world/power/plot/style)                                                                            |
| GET/POST/PATCH/DELETE | `/entities`, `/entities/:entityKey` | entity DTOs                                      | entity responses                    | EntityService (author characters/factions/locations)                                                                         |

### 7.4 Generation module (`/projects/:id/...`)

| Verb    | Route                            | Body                                                      | Response                                        | Service                                    | Notes                              |
| ------- | -------------------------------- | --------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------ | ---------------------------------- |
| POST    | `/outline`                       | `OutlineBody { count?, start?, context? }`                | 200 `OutlineResponse`                           | GenerationService.outline (LLM)            | Writes `briefs`.                   |
| GET/PUT | `/briefs/:n`                     | `{ title?, body }`                                        | brief responses                                 | BriefService                               | Author edits.                      |
| POST    | `/generate`                      | `GenerateBody { limit?, autoFix?, maxFixes?, guidance? }` | 202 `JobResponse`                               | GenerationService.generate (LangGraph job) | Draft → judge → (auto-fix loop).   |
| GET     | `/drafts`                        | —                                                         | 200 `ListDraftResponse` (+ derived STATUS view) | DraftService                               | Replaces STATUS.md/DRAFT_STATE.md. |
| GET     | `/drafts/:n`                     | —                                                         | 200 `DraftResponse`                             | get                                        |
| PUT     | `/drafts/:n`                     | `{ title?, body, summary?, state? }`                      | 200                                             | hand-edit draft                            |
| POST    | `/drafts/:n/revise`              | `{ note }`                                                | 200 `DraftResponse`                             | revise (LLM)                               |
| POST    | `/drafts/:n/judge` (or `/judge`) | —                                                         | 200 `JudgeResponse`                             | judge (LLM)                                |
| POST    | `/finalize`                      | `{ chapter? }`                                            | 200 `FinalizeResponse`                          | FinalizeService (LLM write-back)           | In-order gate.                     |
| GET     | `/drafts/:n/prompt`              | —                                                         | 200 `{ markdown }`                              | export handoff prompt                      |
| POST    | `/drafts/:n/import`              | `{ prose, title?, summary? }`                             | 201 `DraftResponse`                             | import external prose                      |
| GET     | `/manuscript`                    | —                                                         | 200 `{ markdown }`                              | ManuscriptService (export)                 |
| POST    | `/backfill`                      | —                                                         | 202 `JobResponse`                               | RetrievalService.backfill                  |

**Grok interlude chapters (§8.6)** `/projects/:id`:

| Verb  | Route                                      | Body            | Response                         | Service                           | Notes                                                                                                                       |
| ----- | ------------------------------------------ | --------------- | -------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| POST  | `/chapters/:n/generate-grok`               | `{ guidance? }` | 200 `DraftResponse`              | GenerationService.generateGrok    | Force `xai` for `generation` (per-op). `generator: grok`, no auto-judge (human review). Requires `ai.xaiApiKey` → `AI_003`. |
| POST  | `/chapters/:n/propose-continuity`          | —               | 200 `ContinuityProposalResponse` | ContinuityProposalService.propose | Grok extracts the write-back delta; **stages** it (pending), does not apply.                                                |
| GET   | `/chapters/:n/continuity-proposal`         | —               | 200 `ContinuityProposalResponse` | get                               | The proposed bible changes for the UI.                                                                                      |
| PATCH | `/chapters/:n/continuity-proposal`         | `{ proposal }`  | 200                              | edit                              | Human edits the delta (reword/remove items) before applying.                                                                |
| POST  | `/chapters/:n/continuity-proposal/apply`   | —               | 200 `{ applied }`                | apply                             | Applies the **edited** delta to the bible (no new LLM call); `continuityApplied=true`.                                      |
| POST  | `/chapters/:n/continuity-proposal/discard` | —               | 204                              | discard                           | Nothing enters the bible.                                                                                                   |

**Validation module** `/projects/:id`: POST `/validate` → 200 (or 202) `ValidationReportResponse`; POST `/chapters/:n/review` → 200 `ReviewResponse`; GET `/validation-reports` list. **Note:** `validate`/`review` skip `generator: grok` chapters in a `standard` project (a censoring model would refuse); surface them as "human-reviewed, not machine-validated."

**Illustration module** `/projects/:id/entities/:entityKey/illustration`: POST (start: `{ instruction?, noChat? }`) → returns a preview image + session id; POST `/refine` `{ instruction }` → new preview; POST `/save` → stores; POST `/cancel`. Model the interactive loop as a short-lived session (an `illustration_sessions` table or in-memory keyed by session id) since HTTP is stateless. Uses the **`openai/gpt-image-1`** model (requires `ai.openaiApiKey`); saved bytes go through the `IMAGE_STORAGE` provider (§9.4).

### 7.5 Request/response shapes

Every list endpoint: `PaginationQuery(SortByTime)` + filters; response `Paginated(ItemResponse)`. Mutations return the full resource. `JobResponse { jobId, kind, status, target }`. Errors return `{ code, type, message }`.

### 7.6 Error responses (new `AppErrorCode` groups)

Define codes analogous to pulse (`classes/app-error-code.ts`), e.g.: `PRJ_001` project not found (`NOT_FOUND`), `PRJ_002` name exists (`CONFLICT`), `PRJ_003` wrong kind for op (`CLIENT_ERROR`); `SRC_001` no source/adapter for URL; `CHP_001` chapter not found; `PLN_001` plan not approved (`CLIENT_ERROR`); `DRF_001` no draft; `DRF_002` draft already final; `DRF_003` unresolved contradiction blocks generate; `FIN_001` cannot finalize out of order; `AI_001` model returned invalid JSON; `AI_002` role/model not in registry (or subprocess provider disabled by env); `AI_003` `grok_only` project (or grok interlude chapter) may only use xAI / missing `ai.xaiApiKey` (`CLIENT_ERROR`); `CNT_001` no pending continuity proposal for this chapter (`NOT_FOUND`); `ENT_001` entity not found. Map DB unique-constraint names → codes in `database.constants.ts`.

### 7.7 Async jobs (long ops) — status trackable at all times

`ingest`, `extract`, `generate`, `backfill`, `resume` are long. Pattern (mirror pulse's fire-and-forget + jobs table): the POST inserts a `jobs` row (`pending`), hands it to the **ConcurrencyController** (§9.2) which schedules the executor **without the request awaiting it**, and returns **202 `JobResponse { jobId, kind, status, target, progress }`**. The executor moves `pending → in_progress → done|failed` and writes **progress** as it goes (see below). On boot, a recovery sweep re-claims stuck `in_progress` jobs (crash safety) — the framework analogue of the resumable queue.

**Status is queryable at any time** (decision §1.1.3): `GET /jobs/:jobId` and `GET /projects/:id/jobs` return the live row — `status`, `attempts`, `lastError`, `nextAttemptAt`, and a **`progress jsonb`** field the executor updates incrementally (e.g. `{ done, total, current, phase }` — chapters drafted so far, chapter being judged, etc.). Because progress is persisted on the row (not held in memory), a poll during a multi-chapter `generate` always reflects where it is. Terminal jobs stay queryable (append-only history).

Quick ops (`consolidate`, `plan`, `approve`, `judge`, `finalize` one chapter, `validate`, `review`, `outline`, `assets`, `cost`, `status`) stay synchronous but **still pass through the ConcurrencyController** so a synchronous local-LLM call cannot run concurrently with a job that is using the same local model. `finalize`/`generate` enforce in-order + gate logic regardless of sync/async.

**Auth-ready seam (decision §1.1.2):** every controller is decorated with a currently-permissive `@UseGuards(AuthGuard)` (or the framework's guard equivalent) that today returns `true`; job/project rows carry `ownerId` (nullable). Adding auth later = implement the guard + `WHERE ownerId = caller` filters, no route/table changes.

---

## 8. AI Migration Plan

### 8.0 Stack & wiring

Add deps: `langchain`, `@langchain/core`, `@langchain/anthropic`, `@langchain/openai` (LLM **and** image gen), `@langchain/xai` (Grok), `@langchain/ollama` (local LLM + `qwen3-embedding:8b`), `@langchain/langgraph`, `llamaindex` + `@llamaindex/postgres` (pgvector), `zod`, `pgvector`. Config keys via `bootstrap.ts`: `ai.anthropicApiKey`, `ai.openaiApiKey`, `ai.xaiApiKey`, `ai.grokLlmModel`, `ai.grokImageModel`, `ai.ollamaHost`, `ai.allowClaudeCode` (bool), `ai.allowCodex` (bool), `ai.claudeCodeBin`, `ai.codexBin`, plus `EMBEDDING_DIM` (=1024).

**Providers (decision §1.1.4–7):**

- `anthropic` — Claude via API key (`ChatAnthropic`).
- `openai` — GPT via API key (`ChatOpenAI`) **and** image gen (`gpt-image-1`) for `illustration` in `standard` projects.
- `xai` — Grok via API key (`ChatXAI` from `@langchain/xai`, OpenAI-compatible), incl. its image model. **The only provider used by `grok_only` projects** (§8.5). Config key `ai.xaiApiKey`.
- `ollama` — local server (`ChatOllama` / `OllamaEmbeddings`); default **`embedding`/`retrieval` role = `ollama/qwen3-embedding:8b`** (truncated to 1024 dims); local LLMs supported.
- `anthropic-claude-code` and `openai-codex` — **subprocess** adapters (shell out to the `claude` / `codex` CLIs), gated by `ai.allowClaudeCode` / `ai.allowCodex` env flags; primarily local dev. Implement as thin LangChain-compatible wrappers (a custom `Runnable`/`SimpleChatModel` that spawns the CLI, single-turn, sandboxed, hides the API key env for the call). Port the safety notes from the Python adapters (`--sandbox read-only`, ephemeral cwd, `--output-last-message`, timeout).

The registry (`ai/models.ts`) maps `provider/model → { kind, input, output }`; local/subprocess models are free (no prices). Role→model defaults live in `ai/defaults.ts`, overridable per project via `projects.config`. A role whose model is absent/wrong-kind, or whose subprocess provider is disabled by env, is rejected (`AI_002`).

**`modules/ai/`** mirrors `llm/`:

- `models.ts` — the registry (port `data/models.yml`): `Record<providerSlashModel, { kind:'llm'|'embedding'|'image', input:number, output:number }>`. Validation identical to `_validate_models`.
- `model-router.service.ts` — `ModelRouterService` = the `ModelRouter` analogue. `chatFor(role, opts?): BaseChatModel` (LangChain, e.g. `ChatAnthropic({ model, temperature, maxTokens })`), `embeddingsFor(role)`, `imageModelFor(role, opts?)`. Resolve role→provider/model from project `config` merged over defaults; **`opts.forceProvider`** pins a single call to a provider (used by grok interlude chapters, §8.6) — subject to the same registry/enable checks. `grok_only` (§8.5) still wins over `forceProvider`. Wrap every call with:
  - **Retry:** `.withRetry({ stopAfterAttempt: retry.attempts })` or a custom transient-classifier matching `_is_transient` (HTTP 408/429/5xx + connection/timeout names) with exponential backoff (1s→30s). Non-transient (auth/bad-request/refusal) fail fast.
  - **Structured output:** `chat.withStructuredOutput(zodSchema)` (Anthropic tool-use). For prompt-driven providers, append the JSON directive (`json_directive`) and parse tolerantly (port `_extract_json`: first balanced `{...}`), throwing an `AiResponseError` (→ `AI_001`) on failure.
  - **Tracing/provenance:** record request/response to `extractionRuns` (or a `model_calls` log) _before_ parsing, so raw output survives an invalid parse. Log `model call` with role/op/provider/model/seconds.
- `ai/schemas/*.ts` — Zod ports of every schema in `prompts.py` (EXTRACTION, NEW_NOVEL, PLAN, SKELETON, GENERATION, OUTLINE, TITLE, REVISION, FIX, CONTINUITY, VALIDATION, REVIEW). Keep field descriptions (they steer the model).
- `ai/prompts/*.ts` — port every system/prompt builder verbatim (`build_extraction`, `build_new_novel`, `build_plan`, `build_skeleton`, `build_generation`, `build_outline`, `build_title`, `build_revision`, `build_fix`, `build_continuity`, `build_judge`, `build_validation`, `build_review`, `build_illustration`). **Do not paraphrase** — the exact wording (serialization rules, `[HARD]`/`[SOFT]` convention, `CONSISTENT` sentinel) is behavior.
- `ai/prompts/authoring-preamble.ts` — **the global web-novel + simple-English directive (decision §1.1.17).** A constant `AUTHORING_STYLE` string **prepended to the system prompt of every prose-authoring call** — `build_generation`, `build_revision`, `build_fix`, `build_outline`, `build_new_novel`, `build_plan`, and the bible-builder (§8.7). It instructs: _write a **web novel** only; use **very simple, easy-to-understand English** — short sentences, common everyday words, no rare/archaic/ornate vocabulary or heavy jargon; explain any invented term plainly; keep it readable for a broad, non-native-English audience._ It is **not** added to the analytical prompts (`build_extraction`, `build_judge`, `build_validation`, `build_review`, `build_continuity`) — those reason over text, they don't produce the novel's prose. Keeping it one constant means the style is tuned in one place. (The `target_words`/pacing directives already in the builders remain.)

### 8.1 Single-shot LangChain calls (one call in → structured out)

For each, the pattern is: assemble context (pure service) → `router.chatFor(role).withStructuredOutput(Schema).invoke([system, prompt])` → persist. **Use LangChain (not LangGraph)** for these:

| Workflow                 | Role           | Schema              | Persist                                                                                                         |
| ------------------------ | -------------- | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| Extraction (per chapter) | extraction     | ExtractionSchema    | entities/aliases/appearances/observations/beats/threads/worldFacts/mysteries/chapters.summary (one txn) + embed |
| New-novel seed           | analysis       | NewNovelSchema      | bibleDocuments (vision/world/power/plot) + entities (`origin seeded`, `status planned`)                         |
| Plan                     | planning       | PlanSchema          | volumes (`status draft`; single-tier, §1.1.16)                                                                  |
| Skeleton                 | analysis       | SkeletonSchema      | projects.skeleton* + source volumes (`status source`)                                                           |
| Outline (batch)          | planning       | OutlineSchema       | briefs                                                                                                          |
| Title salvage            | classification | TitleSchema         | draft.title (sanitize: strip "Chapter N:", reject multiline/overlong)                                           |
| Revision                 | generation     | GenerationSchema    | draft (rev++)                                                                                                   |
| Continuity write-back    | analysis       | ContinuitySchema    | flip planned→active, register generated entities, upsert trackers (idempotent)                                  |
| Validate                 | validation     | ValidationSchema    | validationReports (novel)                                                                                       |
| Review                   | review         | ReviewSchema        | validationReports (chapter)                                                                                     |
| Judge                    | validation     | (free text → parse) | draft.judge/judgeNote; `_parse_verdict` HARD/SOFT logic                                                         |

**Judge is text, not structured** — it returns `CONSISTENT` or tagged finding lines; port `_parse_verdict` exactly (all-SOFT ⇒ consistent+notes; any HARD/untagged ⇒ contradiction).

### 8.2 LangGraph — the generation autopilot (multi-step, branching, loop, retries, state)

This is the one true state machine. Model `generate --auto-fix` as a LangGraph `StateGraph`:

**State:** `{ projectId, chapter, layout, brief, draft, verdict, findings, attempt, maxFixes, prevFinding, result }`.

**Nodes/edges:**

1. `assembleBrief` (pure) → `draftChapter` (generation LLM, GenerationSchema) → write draft.
2. → `judge` (validation LLM) → set verdict/findings.
3. Conditional edge: `verdict==consistent` → `accept` (END). `contradiction` → `repair`.
4. `repair`: try `applyPatch` (generation LLM, FixSchema — minimal find/replace; each `find` must occur exactly once, else fall back to `rewriteFull` with GenerationSchema). Write draft (rev++), merge partial `state`.
5. → `judge` again. Conditional: consistent → `accept`; `attempt>=maxFixes` → `acceptAsIs`; **same finding as prev** (`_same_finding`) → `acceptAsIs` (early stop); else → `repair` (attempt++).
6. Model-call error anywhere → propagate/halt the job (autopilot needs a working judge).

The **interactive** (non-auto-fix) mode is the same graph truncated: draft → judge → if contradiction, **stop** and surface (no repair). Run the graph once per pending chapter inside the `generate` job loop; forward-only (skip already drafted/finalized).

**Brief assembly (`_brief`)** is a pure `GenerationBriefService` — port faithfully (§2.11 #2): vision/power/world (trimmed), current **Volume** + this-chapter brief, story-state, active-cast split (`full_cast_max`) vs demoted vs planned, budgeted serial memory (`_memory`: recent summaries + established facts under `memory_chars`), current situation (`_situation`), previous-chapter verbatim tail (`prev_tail_chars`), writing style, retrieval snippets. The judge shares this brief. **Grok-adjacency rule (§8.6):** if the immediately-previous chapter is `generator:grok`, replace its verbatim prose tail with its summary + continuation `state` so a censoring model isn't fed explicit text; grok chapters are also excluded from retrieval.

### 8.3 LlamaIndex.TS — indexing, retrieval, RAG

Replace LanceDB + the Voyage embed calls with LlamaIndex + pgvector:

- **Index/store:** `PGVectorStore` over the `chapterChunks` table (dim = embedding model dim). One logical namespace per `projectId` (filter on `projectId`).
- **Chunking:** port `_chunk` (paragraph-boundary ~`chunk_chars`) or use a LlamaIndex `SentenceSplitter` tuned to match; keep chunk text for retrieval display.
- **Embedding:** a LlamaIndex embedding model bound to the `embedding` role — **`ollama/qwen3-embedding:8b`** (truncated to dim 1024), configurable per project; **skipped entirely for `grok_only` projects** (§8.5). Add on finalize (`_embed_prose`) and extract (`_embed`); **best-effort** (failure never fails the chapter). Delete-by-(projectId,chapter) before re-add (idempotent). Because this is a **local** model, all embedding work is serialized by the ConcurrencyController (§9.2).
- **Retrieval:** `_retrieve` → embed the query (`retrieval` role, `input_type=query`) → top-k over `chapterChunks` (filter projectId), return `text[:400]`. Best-effort → `[]` when embeddings absent. Used in brief assembly.
- **Backfill:** finalized chapters missing chunks (compare `chapters` done vs distinct `chapterChunks.chapter`).

### 8.4 Structured output parsing / retry / logging / tests

- **Parsing:** Zod via `withStructuredOutput`; tolerant fallback (`_extract_json`) for prompt-driven providers; `AiResponseError`→`AI_001` on failure, with the raw output already persisted.
- **Retry:** transient-only, exp backoff, capped; permanent errors fail fast (port `_is_transient`).
- **Logging:** per-call timing + provenance (`extractionRuns`); mask nothing sensitive here (prose) but keep payloads out of INFO logs.
- **Test strategy (mocked LLMs):** inject a **fake `ModelRouterService`** (returns canned structured objects / verdict strings) so extraction, newnovel, plan, generation graph, judge, auto-fix, finalize write-back, validate/review run deterministically offline — exactly the Python fake-router pattern. Test: draft→judge→autofix loop transitions, early-stop on repeated finding, patch-uniqueness fallback, all-SOFT⇒consistent, title sanitization, brief budget trimming, idempotent write-back.

### 8.5 Grok-only content mode (adult / uncensored novels)

Decision §1.1.11. A project's `contentMode` (`standard | grok_only`) is read by `ModelRouterService` on every resolve. This is a **hard routing override that fails closed**, not a soft preference — the point is that Anthropic/OpenAI/Ollama models **refuse** to extract, judge, validate, or review uncensored prose, which would silently break the pipeline. Enforce it centrally so no service can bypass it:

- **Routing:** when `project.contentMode === 'grok_only'`, `chatFor(role)` and `imageModelFor(role)` **ignore config/defaults and return an `xai` model** (`ai.grokLlmModel`, e.g. `grok-4`; `ai.grokImageModel` for illustration). Any attempt to resolve a role to a non-`xai` provider throws `AI_003` ("grok_only project may only use xAI"). This covers _every_ prose-touching role — extraction, analysis, planning, generation, validation, review, classification, continuity — so nothing refuses.
- **Embeddings/retrieval disabled:** xAI has no embedding model and substituting another provider would reintroduce a censoring model. So for `grok_only`, `embeddingsFor` is a no-op (returns nothing) and `RetrievalService.retrieve` returns `[]`. Generation still works — retrieval is best-effort in the brief (§8.3) — it just relies on the serial draft-memory instead of semantic recall. `chapterChunks` stays empty (§6.9); `backfill` is a no-op.
- **Validation on write:** creating/patching a project validates that, if `grok_only`, `ai.xaiApiKey` is set and every explicitly-overridden role in `config` is `xai` (reject otherwise, `AI_003`). Switching a `standard` project to `grok_only` re-points routing immediately (no re-embed needed since retrieval just goes dark).
- **Concurrency:** `xai` is a **remote API** provider, so `grok_only` jobs follow the remote rule in §9.2 (same-novel serial, different-novel parallel) — unless a role still routes local (it won't, since grok_only forbids non-xai).
- **Not a global switch:** `standard` projects never touch Grok; the two modes coexist per project in the same server.

### 8.6 Grok interlude chapters in a `standard` project (human-reviewed; opt-in bible promotion)

Decision §1.1.12. Distinct from a `grok_only` project (§8.5): a `standard` project keeps its normal models but may author **individual** chapters with Grok. Per-chapter flag `generator` on `drafts` + `chapters` (`standard | grok`). This needs a **per-op provider override** on the router — `chatFor('generation', { forceProvider: 'xai' })` — independent of the project's default routing; requires `ai.xaiApiKey` (else `AI_003`).

**Authoring flow (chapter n):**

1. `POST /projects/:id/chapters/:n/generate-grok { guidance }` (or `generate` with `generator:'grok'`, limit 1). Router forces `xai` for the `generation` role for this call only. The brief is assembled normally (Grok reads canon fine). Draft written `generator: grok`.
2. **No automated judge** — the continuity judge would route to a censoring model and refuse, and per the requirement the **human evaluates**. `judge` stays null; the UI marks it "awaiting human review." The human hand-edits the draft freely, then finalizes.
3. **`finalize` of a grok chapter:** store prose + summary + continuation `state` (so serial continuity still flows to later chapters), advance the story-state cursor, update the chapter-summaries serial memory — **but skip the continuity write-back AND skip embedding** (`chapters.continuityApplied=false`). Its entities/threads/etc. do **not** enter the bible/knowledge tables and its explicit prose is **not** indexed for retrieval. This is the "most grok content isn't maintained as canon" default.

**Adjacency safety (important):** when assembling the brief for any chapter whose immediately-previous chapter is `generator: grok`, substitute that chapter's one-line **summary + continuation `state`** for the usual verbatim previous-chapter prose tail (`_prev_ending`), so a censoring model is never fed explicit text. Grok chapters are also excluded from retrieval (not embedded), so they can't surface into a standard chapter's brief that way either.

**Opt-in promotion to the lore bible (staged, editable, human-decided write-back):** 4. `POST /projects/:id/chapters/:n/propose-continuity` runs the continuity write-back extraction **with Grok** (CONTINUITY_SCHEMA — only Grok will read the uncensored prose) and **stages** the result in `continuity_proposals` (status `pending`) **instead of applying it**. Returns the structured proposal for the UI. 5. **The UI shows exactly the changes Grok proposes** — each delta is a concrete bible change (new character X, thread Y opened, timeline event Z, relationship, power-up). `GET .../continuity-proposal` fetches the pending proposal; `PATCH .../continuity-proposal` lets the human **edit** it (rename/reword/remove any item — removing items is how per-change reject works) before saving. 6. The human decides: `POST .../continuity-proposal/apply` applies the **edited** deltas to the bible/knowledge tables (the same idempotent write-back logic as `_continuity`, but sourced from the reviewed proposal — **no fresh LLM call**), sets `chapters.continuityApplied=true` and the proposal `applied`; `POST .../continuity-proposal/discard` sets `discarded` and changes nothing.

The staged-proposal mechanism is generic (it could gate standard-chapter write-back too) but is **default-on only for grok chapters**; standard chapters keep the automatic write-back at finalize. All of this obeys the §9.2 concurrency rules (a grok op is a remote `xai` call ⇒ per-project serial).

### 8.7 Full lore-bible generation from a high-level brief (LangGraph)

Decision §1.1.13. Creating a `new_novel` project scaffolds an empty bible; the user is then prompted for a high-level brief, and `POST /projects/:id/seed-from-brief { brief }` runs a LangGraph **bible-builder** job that fills the _entire_ bible from that one brief, in dependency order — each node a structured LLM call (role `analysis`/`planning`) writing to the normalized tables:

1. `foundation` — title, premise, themes, tone → `projects` (premise/themes) + `bible_documents` (vision). New `build_bible_from_brief(brief)` prompt (a source-less variant of `build_new_novel`; reuse/extend NEW_NOVEL_SCHEMA).
2. `world` + `power` — foundational world facts + power/magic system → `world_facts`, `bible_documents` (world, power).
3. `factions` + `locations` — the major groups/places the premise needs → `entities` (type faction/location, `status: planned`, `origin: seeded`, prose `body`).
4. `characters` — primary characters with motivations → `entities` (type character, `status: planned`, `origin: seeded`, prose `body`).
5. `plot` — overall plot + ending vision → `bible_documents` (plot).
6. `volumes` — a first-draft Volume plan → `volumes` (`status: draft`, single-tier §1.1.16), so the user has structure to edit (equivalently they can run `plan` afterward).

Everything is written `status: draft`/`planned` and is immediately **editable** via the existing bible CRUD (§7.3) — the builder produces a first pass; the human refines each section. It is one job (§7.7) so progress is pollable. Uses the project's configured models (or Grok if `grok_only`). The raw `brief` is stored on `projects.brief` (needed for re-seed + clone "same input text"). Re-running re-seeds by key idempotently, but **must not silently clobber hand-edits** — require `force: true` to overwrite sections the user has already edited (detect via `updatedAt`/an `edited` flag), otherwise only fill still-empty sections. Concurrency per §9.2.

**Testing (mocked router):** every section table gets rows; all are `draft`/`planned`; sections are editable afterward; re-seed without `force` preserves an edited section; `brief` persisted.

---

## 9. Job Execution, Concurrency & Provider Design

> **Data migration is OUT OF SCOPE (decision §1.1.1).** There is no legacy import; every project is created fresh through the API. This section covers what replaced it: the async job runner, the concurrency policy, AI-provider selection, and the swappable image-storage provider.

### 9.1 Async job runner (in-process, resumable, trackable)

No external queue (decision §1.1.9). A `JobService` owns the `jobs` table. `enqueue(projectId, kind, target, payload)` inserts a `pending` row (idempotent on `(projectId, kind, target)`) and hands it to the **ConcurrencyController** (§9.2). The executor for a kind (`ingest`/`extract`/`generate`/`backfill`/`resume`) runs the corresponding pipeline service, writing `progress` incrementally and moving `in_progress → done | failed` (with `attempts`/`lastError`/`nextAttemptAt`, mirroring the Python retry budget). All underlying writes remain idempotent (upsert-by-key + draft/cursor presence), so a re-run continues from the last completed unit. On app start, a recovery sweep re-arms `in_progress` jobs (crash safety). Status is always live via `GET /jobs/:id` and `GET /projects/:id/jobs` (§7.7).

### 9.2 Concurrency policy (decision §1.1.10) — the ConcurrencyController

Every AI-touching unit of work (a job, or a synchronous LLM op) is scheduled through one `ConcurrencyController`. It computes an **execution class** and a **lock key**, then serializes work that shares a key while letting different keys run in parallel.

- **Classify by the providers the job's role(s) resolve to** (a job may use several roles — e.g. `generate` uses generation+validation+retrieval+classification):
  - **local** — any role resolves to `ollama`, `anthropic-claude-code`, or `openai-codex` (subprocess/local server). Because embeddings default to `ollama/qwen3-embedding:8b`, almost every job that embeds is at least partly local.
  - **remote** — all roles resolve to an external API (`anthropic`, `openai`).
  - **Mixed ⇒ treat as local** (most restrictive).
- **Lock key:**
  - local ⇒ `"local:global"` — a single global lock: **all local-LLM work runs strictly serially** across every novel (protects the one local machine/GPU/CLI from contention).
  - remote ⇒ `"project:<projectId>"` — **serial within a novel, parallel across novels**: same-novel API jobs queue behind each other (continuity ordering); different-novel API jobs run concurrently.
- **Implementation:** an in-memory `Map<string, Promise<void>>` promise-chain per key (a keyed async mutex/queue). `run(key, fn)` chains `fn` onto the key's tail promise and returns the result; distinct keys never block each other. Keep the map process-local (no external queue). Provide `pendingByKey()` for observability.
- **Interaction with §7.7:** synchronous quick ops also acquire their key before calling the model, so a sync local call can't overlap a running local job. The controller is the single choke point for the whole policy — do not scatter locks into services.
- **Edge cases:** a remote job whose only local touch is optional best-effort embedding still classifies local (embedding uses ollama); if that is too coarse in practice, allow a per-op class override so the _embedding sub-step_ takes `local:global` while the _generation_ stays `project:<id>` — but default to the simple whole-job classification first.

### 9.3 AI provider selection (env / config gated)

Resolution precedence in `ModelRouterService`: **(1) `project.contentMode === 'grok_only'` ⇒ force `xai` for every LLM/image role and disable embeddings (§8.5) — this wins over everything;** otherwise (2) role→`provider/model` from `ai/defaults.ts` deep-merged with `projects.config` (per-project override), validated against `ai/models.ts` (§8.0). Subprocess providers (`anthropic-claude-code`, `openai-codex`) are only selectable when their env flag (`ai.allowClaudeCode` / `ai.allowCodex`) is on — otherwise `AI_002`. This keeps subscription-CLI usage to local dev while the same config shape works in prod with `anthropic`/`openai`. `ollama` (incl. the default embedder) is available if `ai.ollamaHost` is reachable.

### 9.4 Swappable image storage (decision §1.1.8) — DI provider

Illustration bytes go through a provider interface, swappable by DI exactly like pulse's notification providers:

```ts
// modules/storage/image-storage.interface.ts
export const IMAGE_STORAGE = Symbol('IMAGE_STORAGE');
export interface ImageStorageProvider {
  save(projectId: bigint, entityKey: string, bytes: Uint8Array, mime: string): Promise<string>; // returns a stable ref/path
  read(ref: string): Promise<{ bytes: Uint8Array; mime: string }>;
  getUrl(ref: string): string; // a servable URL or API route
  delete(ref: string): Promise<void>;
}
```

- **`LocalImageStorageProvider`** (ship now): writes to `${Config.get('storage.imageDir')}/<projectId>/<entityKey>.<ext>`, returns the relative path; `getUrl` → a `GET /projects/:id/entities/:key/image` route that streams the file. The entity's `imagePath` column stores the ref.
- **`StorageModule.forRoot({ imageStorage: LocalImageStorageProvider })`** registers the token; services inject `@Inject(IMAGE_STORAGE) private readonly imageStore: ImageStorageProvider`. Swapping to an `S3ImageStorageProvider` later = change the one `forRoot` binding (or select by `Config.get('storage.driver')`), **no service code changes** — mirrors `NotificationProviderService` choosing a provider. The framework's dynamic-module support (`@shadow-library/modules` / `@shadow-library/app` `forRoot`) backs this.

### 9.5 Novel cloning (deep-copy for model A/B testing) — decision §1.1.15

`ProjectService.clone(sourceId, { name, config?, contentMode?, resetDerived = true })` copies a project so the **same input** can be run through **different models**. In one transaction:

1. Insert a new `projects` row: fresh `id`, new `name` (unique), copied `kind`/`title`/`brief`/`source*`/`storyState`/`skeleton`; `config` = the override if given else the source's; `contentMode` = override else source's; `ownerId` copied (auth-ready).
2. Copy child tables with the new `projectId`, preserving per-project string keys (`entityKey`/`volumeKey`/…) since uniqueness is `(projectId, key)`; numeric surrogate ids are regenerated. Order parents-before-children for FKs.
3. **`resetDerived: true` (default)** copies only the **inputs** and drops derived data so each clone regenerates under its own `config`:
   - **source project:** copy `chapters` (source prose); **drop** extracted knowledge (entities/beats/threads/world_facts/mysteries/relationships/appearances/observations/summaries), `chapterChunks`, `extractionRuns`, `validationReports`, `jobs`.
   - **new-novel project:** copy the authored **bible** (`bible_documents`, `entities`, `volumes`, `brief`, trackers) + plan; **drop** drafts, generated `chapters`, `chapterChunks`, `continuityProposals`, `validationReports`, `jobs`, and reset the story-state cursor.
4. **`resetDerived: false`** = full byte-for-byte copy (including derived data + embeddings), for snapshotting.

The clone is independent (row-level isolation); running `extract`/`generate` on it with a different `config` and diffing outputs against the original is the intended A/B workflow. `chapterChunks` are copyable (same `EMBEDDING_DIM`) but by default regenerated. Not a job — a synchronous transactional copy (guard very large copies behind a `202`+job if needed).

---

## 10. Implementation Phases for Sonnet

> Work phase-by-phase; each ends green (typecheck + lint + relevant tests). Commit per phase.

### Phase 1 — Project structure & dependencies

- **Goal:** the app boots on the pulse architecture with Postgres wired.
- **Files:** bump/add deps in `package.json` (match pulse `@shadow-library/*` versions; add `drizzle-orm`, `drizzle-kit`, AI stack §8.0); no per-workspace `db:*` scripts — DB commands run as `bun scripts/db.ts apps/novel-forge-server <generate|migrate|create-template|seed>` from the repo root; `tsconfig.json` path aliases (`@modules`, `@server`, `@scripts`, `@tests`); rewrite `bootstrap.ts` (drop `db.uri` mongo default; add `app.stage`, `database.postgres.url`, `ai.*` keys per §8.0, `storage.driver`+`storage.imageDir`); `constants.ts` (`APP_NAME='novel-forge'`); `drizzle.config.ts`; `common/` (enum.dto placeholder, data-transformers, index); a permissive `common/auth.guard.ts` (auth-ready seam, allows all now); update `classes/app-error-code.ts` groups; `database/database.module.ts` + `database.constants.ts` + `index.ts`; `modules/dynamic.modules.ts`; `app.module.ts` imports `[DatabaseModule, HttpRouteModule]`; `tests/test-environment.ts` + `scripts/create-template-db.ts`/`migrate-db.ts`/`seed.ts`.
- **Tasks:** `bun install`; get `bun run dev` to boot against a local Postgres; `bunx tsc -p apps/novel-forge-server/tsconfig.json --noEmit` clean.
- **Acceptance:** app starts, `/api` responds, `bun scripts/db.ts apps/novel-forge-server migrate` runs (empty schema).
- **Commands:** `bun install && bunx tsc -p apps/novel-forge-server/tsconfig.json --noEmit && bun run dev`.

### Phase 2 — Database schema & migrations

- **Goal:** full schema + pgvector.
- **Files:** `database/schemas/{projects,chapters,knowledge,plan,story,bible,generation,jobs,vectors}.ts` + `index.ts` barrel; `common/enum.dto.ts` (EnumType from every pgEnum); pgvector extension SQL.
- **Tasks:** author all tables/enums/relations/uniques/indexes (§6); `drizzle-kit generate`; add `CREATE EXTENSION vector`; `bun scripts/db.ts apps/novel-forge-server create-template`.
- **Acceptance:** migrations apply cleanly; template DB builds; namespaced types infer.
- **Commands:** `bunx drizzle-kit generate && bun scripts/db.ts apps/novel-forge-server migrate && bun scripts/db.ts apps/novel-forge-server create-template`.

### Phase 3 — Core domain modules (projects, chapters, entities, bible)

- **Goal:** CRUD + isolation.
- **Files:** `modules/project/*`, `modules/source/chapter.*`, `modules/bible/*` (entity, volume, bible-document services + controllers + DTOs), register in `dynamic.modules.ts`.
- **Tasks:** ProjectService (create source/new-novel, status, reset, cost hook, **live model-settings via PATCH `config` with the grok-lock exception**, **`clone` deep-copy §9.5**), row-level `projectId` scoping everywhere; entity/volume/document CRUD with idempotent upserts.
- **Acceptance:** create project, author entities/volumes, `status` shape-aware; PATCH `config` reassigns a role's model and the next op uses it (but a grok-locked role rejects `AI_003`); `clone` with `resetDerived:true` yields a new project with identical inputs and no derived rows.
- **Commands:** `bun test tests/project`.

### Phase 4 — Repository/persistence semantics

- **Goal:** port idempotent write logic (`repo.py`).
- **Files:** methods on the domain services (or a shared `KnowledgeRepository`).
- **Tasks:** `upsertEntity` (merge attributes, min firstSeen), thread/world/mystery/beat upserts with COALESCE, appearance/observation insert-ignore, tracker upsert/append idempotency, `resetStage`, `rearmJobs`, `workSummary`, `corpusStats`.
- **Acceptance:** re-running a write never duplicates; unit tests for merge + reset.
- **Commands:** `bun test tests/knowledge`.

### Phase 5 — AI layer, execution (jobs + concurrency) & storage

- **Goal:** provider-agnostic AI with retry/trace + pgvector retrieval, the async job runner, the concurrency controller, and the swappable image-storage provider.
- **Files:** `modules/ai/{models,defaults,model-router.service,costing.service}.ts`, `ai/prompts/*`, `ai/schemas/*`, `modules/ai/retrieval.service.ts` (LlamaIndex+pgvector), the subprocess provider wrappers (`ai/providers/claude-code.ts`, `ai/providers/codex.ts`, env-gated), `modules/ai/concurrency.controller.ts` (§9.2), `modules/jobs/{job.service,job.controller,job.dto}.ts` (§9.1, `GET /jobs/:id`), `modules/storage/{image-storage.interface,local-image-storage.provider,storage.module}.ts` (§9.4), fake router for tests.
- **Tasks:** port registry+validation (providers: anthropic/openai/xai/ollama + gated claude-code/codex; embedding default `ollama/qwen3-embedding:8b` truncated to dim 1024; image `openai/gpt-image-1`, or `xai` image for grok_only); router with **`contentMode` precedence** (grok_only ⇒ xai-only + embeddings off, §8.5) + chatFor/embeddingsFor/imageModelFor + transient-only retry + structured + trace; all prompts/schemas; chunk/embed/search/backfill; JobService (enqueue/recover/progress); ConcurrencyController (keyed mutex, local⇒global / remote⇒per-project); `StorageModule.forRoot` + `LocalImageStorageProvider`.
- **Acceptance:** a mocked call returns a parsed object; registry rejects wrong-kind + disabled subprocess providers; a `grok_only` project routes only to `xai` (spy) with embeddings off; retrieval add+search round-trips (standard); two different-novel remote jobs run in parallel while same-novel and any-local jobs serialize; job status/progress is queryable mid-run; swapping the `IMAGE_STORAGE` binding needs no service edit.
- **Commands:** `bun test tests/ai tests/jobs tests/storage`.

### Phase 6 — Source pipeline (acquire, extract, consolidate, assets, skeleton)

- **Files:** `modules/source/{acquire,adapters/*,text-cleaner}.ts`, `modules/extraction/{extraction,consolidate}.service.ts`, `modules/source/asset.service.ts`, `modules/planning/skeleton.service.ts`, jobs module.
- **Tasks:** port fetcher + the removed source adapter + `text.py` cleaner (byte-level tests), cursor-driven ingest job, extract job (persist txn + embed + auto-consolidate), consolidate maps, assets renderer (string), skeleton LLM.
- **Acceptance:** faked-fetcher ingest resumes+idempotent; faked-router extract accumulates+resumes; consolidate promotes correctly.
- **Commands:** `bun test tests/source tests/extraction`.

### Phase 7 — Generation (newnovel, plan, outline, generate graph, revise, judge, finalize, validate, review, illustrate, manuscript)

- **Files:** `modules/planning/{newnovel,planning,scaffold,bible-builder}.service.ts` (bible-builder = seed-from-brief LangGraph, §8.7), `modules/generation/*` (brief service, generation graph, draft/finalize/manuscript services + controller + DTOs, `grok-chapter.service.ts`, `continuity-proposal.service.ts`), `modules/validation/*`, `modules/illustration/*`.
- **Tasks:** **full-bible builder from a brief** (LangGraph, §8.7 — fills every section `draft`/`planned`, editable, `force`-guarded re-seed); port brief assembly faithfully (incl. the **grok-adjacency rule** §8.6); LangGraph generate/auto-fix; judge parse; finalize write-back + ordering; validate/review (skip `generator:grok` chapters); illustration session; handoff/import; **grok interlude chapters** (`generate-grok`, human review, finalize without write-back/embed, `generator:grok` flags); **staged continuity proposal** (propose via Grok → edit → apply/discard, §8.6).
- **Acceptance:** faked-router: **seed-from-brief fills every bible section (`draft`/`planned`) from one brief, sections editable, re-seed without `force` preserves edits**; plan gate, chapter→volume layout, forward-only drafting, auto-fix loop transitions + early stop, write-back flips planned→active, finalize in-order; a grok chapter finalizes with no bible mutation + no embedding; a proposal stages (pending), edits persist, apply mutates the bible idempotently, discard changes nothing; a standard chapter after a grok chapter gets summary/state (not verbatim) in its brief.
- **Commands:** `bun test tests/generation tests/validation`.

### Phase 8 — Concurrency, job recovery & provider-swap hardening

- **Goal:** prove the runtime policies end-to-end (no data migration — decision §1.1.1).
- **Files:** wire pipelines (Phases 6–7) through `JobService` + `ConcurrencyController`; crash-recovery sweep on boot; `S3ImageStorageProvider` **stub interface only** (to prove swappability — not a working cloud impl).
- **Tasks:** route every long op through `enqueue`; persist `progress` at each chapter/unit; recover `in_progress` on start; verify subprocess providers gate on env; verify one-line storage swap.
- **Acceptance:** kill mid-`generate` → restart resumes; `GET /jobs/:id` shows progress throughout; local-LLM jobs never overlap; different-novel API jobs overlap; changing `storage.driver` selects a different provider with no service change.
- **Commands:** `bun test tests/jobs tests/concurrency tests/storage`.

### Phase 9 — Tests

- **Files:** `tests/**` mirroring modules + `test-environment.ts` mocks (fake router, mocked long jobs).
- **Tasks:** unit + service + API + AI-orchestration (mocked) + edge cases (§11).
- **Acceptance:** `bun test` green; coverage of the §2.11 risk areas.

### Phase 10 — Documentation & verification

- **Files:** `README.md`, `CLAUDE.md` (commands, architecture, env), API notes.
- **Tasks:** run the §12 checklist end-to-end.
- **Acceptance:** every checklist item passes.

---

## 11. Testing Plan

Use `bun:test` + `TestEnvironment` (template-DB clone per spec) + a **fake `ModelRouterService`** (canned structured/verdict outputs) and a **fake fetcher** (canned pages). Mirror module structure under `tests/`.

- **Unit:** text cleaner (byte-level golden — port `test_text*`), `_extract_json`, `_parse_verdict` (CONSISTENT / all-SOFT / HARD / untagged), title sanitization, `_memory` budget trimming, `_split_cast`, consolidate synonym/structural/symmetric/inverse + direction resolution, cost estimator.
- **Service:** upsert idempotency (attributes merge, min firstSeen, COALESCE), tracker upsert/append idempotency, reset stages, plan gate, finalize ordering, write-back flips/registers/upserts, config deep-merge + registry validation.
- **Repository:** unique-constraint isolation by `projectId`, cascade deletes, `pending_jobs`/`work_summary`/`rearm_jobs`.
- **API:** each endpoint (status codes, DTO validation, error codes, pagination), dev-only route gating, 404/409 mapping.
- **Jobs & concurrency:** job enqueue idempotency + status/progress reflected live; crash-recovery re-arms `in_progress`; ConcurrencyController — local job ⇒ global serial, same-novel remote ⇒ serial, different-novel remote ⇒ parallel, mixed ⇒ local; sync op waits behind a running local job.
- **Providers & storage:** subprocess providers rejected when their env flag is off; embedding resolves to `ollama/qwen3-embedding:8b` (dim 1024); image to `openai/gpt-image-1`; `IMAGE_STORAGE` swap (local ↔ stub) needs no service change; `LocalImageStorageProvider` save/read/getUrl round-trip.
- **Grok-only mode:** a `grok_only` project routes _every_ LLM/image role to `xai` (assert with a spy that no anthropic/openai/ollama model is ever constructed for it); non-xai config override rejected `AI_003`; embeddings/retrieval are no-ops (empty chunks, `retrieve()===[]`, `backfill` no-op); a `standard` project in the same test run never touches xAI.
- **Grok interlude chapters (§8.6):** `generate-grok` forces `xai` for one chapter (spy), sets `generator:grok`, runs no auto-judge; finalize commits prose but writes **no** bible/knowledge rows and **no** embedding (`continuityApplied=false`); a standard chapter after a grok chapter gets summary/state (not verbatim tail) in its brief; `validate`/`review` skip grok chapters. **Continuity proposal:** propose stages a pending Grok delta (no bible change); PATCH edits persist; apply mutates the bible idempotently from the edited delta with no new LLM call and sets `continuityApplied=true`; discard changes nothing; apply/get with no pending proposal → `CNT_001`.
- **Full-bible builder (§8.7):** seed-from-brief writes rows into every bible section (vision/world/power/plot/characters/factions/locations/volumes), all `draft`/`planned`; sections editable via CRUD afterward; `brief` persisted on the project; re-seed without `force` preserves an edited section, `force` overwrites.
- **Novel settings (§1.1.14):** PATCH `config` reassigns a role's model and the next op uses it; a grok-locked role/op rejects the change `AI_003`.
- **Clone (§9.5):** `resetDerived:true` clone has identical inputs (source chapters, or authored bible + brief) and **zero** derived rows (no drafts/knowledge/embeddings/reports); running an op on the clone with a different `config` produces independent output; `resetDerived:false` is a full copy; cloned keys stay unique under the new `projectId`.
- **Volume plan + authoring style:** `plan`/`seed-from-brief` write single-tier `volumes` (no arc tier); chapter→volume layout is contiguous by `chapters_per_volume`; the plan gate needs all volumes `approved`. Every prose-authoring prompt string contains `AUTHORING_STYLE` (web-novel + simple English); the analytical prompts (extract/judge/validate/review/continuity) do not.
- **Auth-ready seam:** permissive guard allows all now; `ownerId` column present and nullable; queries already `projectId`-scoped.
- **AI orchestration (mocked LLM):** extraction persist+accumulate+resume; newnovel partial seed; plan draft+approve gate; generation graph (draft→judge→autofix transitions, early-stop on repeated finding, patch-uniqueness fallback to rewrite, forward-only); judge verdicts; validate/review persistence; retrieval add/search/backfill.
- **Edge cases:** empty prose rejection, non-dict `state`→{}, missing title salvage, retrieval-absent degrade to [], out-of-order finalize rejected, contradiction blocks non-autofix generate, ingest 404=end vs transient=resume, per-project config override vs inherit.

---

## 12. Verification Checklist (run before final response)

- [ ] `bunx tsc -p apps/novel-forge-server/tsconfig.json --noEmit` — no errors (strict, `noUncheckedIndexedAccess`).
- [ ] `bun run lint` — prettier + eslint clean (no `console`, import order, 180-col).
- [ ] `bun test` — all specs pass (template DB required: `bun scripts/db.ts apps/novel-forge-server create-template` first).
- [ ] `bunx drizzle-kit generate` produces no pending diff (schema == migrations); `bun scripts/db.ts apps/novel-forge-server migrate` applies cleanly incl. `CREATE EXTENSION vector`.
- [ ] Every §4 command has a corresponding endpoint (§7) — including `consolidate`, `skeleton`, `outline`, `prompt`/`import`, `illustrate`, `backfill`, `reset`, `cost`, `resume`.
- [ ] AI workflows verified with a mocked router: generation auto-fix loop, judge HARD/SOFT, finalize write-back, retrieval.
- [ ] **No SQLite anywhere** — no `better-sqlite3`/`bun:sqlite` in the repo (no legacy migration; decision §1.1.1).
- [ ] **No Markdown primary persistence** — bible/drafts/briefs/trackers are DB rows; Markdown appears only as rendered API output (assets/manuscript/handoff/STATUS view).
- [ ] No placeholder/stub endpoints; no `TODO`/`throw new Error('not implemented')` in shipped routes (the `S3ImageStorageProvider` interface stub is exempt but must be clearly marked).
- [ ] All long ops are async jobs; **`GET /jobs/:id` reflects live status + progress at any time**; crash-recovery re-claims `in_progress` jobs.
- [ ] **Concurrency policy holds:** local-LLM work is globally serial; same-novel remote serial; different-novel remote parallel (§9.2).
- [ ] **Embeddings** = `ollama/qwen3-embedding:8b` truncated to **1024** dims (pgvector `vector(1024)`); **illustration** = `openai/gpt-image-1`; only the removed source adapter is wired.
- [ ] **Grok-only isolation:** a `grok_only` project calls **only** `xai` for all LLM/image roles (verified by spy), rejects non-xai overrides (`AI_003`), and runs embeddings/retrieval as no-ops; `standard` projects never touch Grok.
- [ ] **Grok interlude chapters:** `generate-grok` produces a `generator:grok`, human-reviewed (no auto-judge) chapter; finalize commits prose with **no** bible write-back and **no** embedding; brief for the next chapter uses the grok chapter's summary/state, not its verbatim prose; `validate`/`review` skip grok chapters.
- [ ] **Staged continuity promotion:** `propose-continuity` (Grok) stages an **editable** proposal without touching the bible; the UI can show + edit the proposed deltas; apply mutates the bible idempotently from the edited proposal (no new LLM call); discard changes nothing.
- [ ] **Brief → full bible:** `seed-from-brief` fills every bible section (editable, `draft`/`planned`) from one high-level brief; `brief` stored; re-seed respects `force`.
- [ ] **Live model settings:** any operation's model is reassignable anytime via PATCH `config` (next op honors it); Grok-locked ops reject the change (`AI_003`).
- [ ] **Novel clone:** `clone` deep-copies inputs into a new project for model A/B; `resetDerived` default keeps inputs + drops derived; the clone is fully isolated.
- [ ] **Single Volume unit (§1.1.16):** the plan is one `volumes` table (no `arcs`); `/volumes` routes, `volumeKey`, `chapters_per_volume`, chapter→volume layout; no `arc`/`arcKey` symbol remains in `src/` (except _character arc_).
- [ ] **Web-novel simple English (§1.1.17):** `AUTHORING_STYLE` is prepended to every prose-authoring prompt and absent from analytical prompts (assert via the built prompt strings).
- [ ] **Subprocess providers** (`anthropic-claude-code`, `openai-codex`) selectable only when their env flag is set; `ollama` supported.
- [ ] **Image storage is a swappable provider** (`IMAGE_STORAGE`); local-folder impl ships; swap needs one module change.
- [ ] **Auth-ready:** permissive guard on controllers, `ownerId` on projects, all reads `projectId`-scoped — future auth adds no tables/routes.
- [ ] `AppErrorCode` covers every failure path; DB constraints mapped in `database.constants.ts`.
- [ ] Per-project `config` override + registry validation work; secrets read from env only.
- [ ] `README.md`/`CLAUDE.md` document commands, env vars, architecture.

---

## 13. Resolved Decisions & Remaining Open Questions

**Resolved by the maintainer (authoritative — see §1.1):**

1. **No data migration** — fresh projects only; no legacy import, scripts, or SQLite readers.
2. **No auth now, auth-ready design** — permissive guard seam + nullable `projects.ownerId` + `projectId`-scoped queries; future auth adds no tables/routes.
3. **In-process async runner** with **always-queryable job status/progress** (`GET /jobs/:id`); no durable external queue.
4. **Embeddings = `ollama/qwen3-embedding:8b`** truncated to **1024** dims; pgvector **dim 1024** (constant `EMBEDDING_DIM`).
5. **Illustration = `openai/gpt-image-1`** (not Gemini).
6. **Only the removed source adapter** (behind the registry seam).
7. **Providers = `anthropic`, `openai`, `ollama` + env-gated subprocess `anthropic-claude-code` / `openai-codex`** (local-dev subscription usage).
8. **Image storage = swappable DI provider** (`IMAGE_STORAGE`), local-folder impl now, cloud later via one module change.
9. **Concurrency:** local-LLM ⇒ global serial; same-novel remote ⇒ serial; different-novel remote ⇒ parallel (§9.2).
10. **Out of scope:** the Flask `browse` UI (a future frontend consumes this API); `novel_spec` legacy table.
11. **Grok-only content mode** (`projects.contentMode = grok_only`, §8.5): adult/uncensored novels route every LLM + image role to **xAI Grok** and call no other provider (fail-closed, `AI_003`); embeddings/retrieval are disabled for these projects. `standard` projects never use Grok. Provider `xai` added; new keys `ai.xaiApiKey`/`ai.grokLlmModel`/`ai.grokImageModel`.
12. **Grok interlude chapters + staged continuity promotion** (§8.6): a `standard` project can author individual chapters with Grok (`generator:grok`), human-reviewed (no auto-judge), committed to the manuscript but **not** written back to the bible or embedded by default (grok-adjacency rule protects the following standard chapter's brief). Opt-in promotion re-extracts the write-back **with Grok** and **stages an editable proposal** (`continuity_proposals`) the human reviews, edits, and applies or discards — nothing enters the bible without that decision.
13. **Brief → full lore-bible generation** (§8.7): a new `new_novel` project is seeded from a single high-level brief that fills the _entire_ bible (all sections `draft`/`planned`) via a LangGraph builder; every section is then editable; the brief is stored on `projects.brief`.
14. **Live per-operation model settings** (§1.1.14): any role's model is reassignable anytime via PATCH `config`, effective next op; Grok-locked ops/projects can't be moved off `xai` (`AI_003`).
15. **Novel cloning** (§9.5): deep-copy a project (inputs-only by default) for A/B testing the same input across different model configs.
16. **Single "Volume" planning unit** (§1.1.16): the Python two-tier volume→arc is flattened to one `volumes` table (Python "arc" renamed Volume); `volumeKey`, `/volumes` routes, `chapters_per_volume`. _Character arc_ (development journey) keeps its name. §2 keeps the source's original terms; §5–§8 use Volume.
17. **Web-novel-only, very simple English** (§1.1.17, §8.0): a global `AUTHORING_STYLE` preamble is prepended to every prose-authoring prompt (generation/revision/fix/outline/newnovel/plan/bible-builder) — web-novel style, short sentences, common words, minimal jargon; not added to the analytical prompts.

**Standing assumptions (proceed unless told otherwise):**

- `assets`/`manuscript`/`prompt`/STATUS/DRAFT_STATE are returned as Markdown **strings** from API endpoints, not files.
- Illustration's interactive refine loop is a short-lived HTTP **session** (session id + preview/refine/save/cancel endpoints); a session row or in-memory map keyed by session id — no websocket.
- API versioning is `v1` (`prefixVersioning`).
- `EMBEDDING_DIM=1024` — `qwen3-embedding:8b` must be requested with **MRL/truncated 1024-dim output** in Ollama; ensure the Ollama call sets the output dimension to 1024 (the model natively emits a larger vector). If a given Ollama build cannot truncate, either post-truncate+renormalize the vector to 1024 in `RetrievalService`, or change `EMBEDDING_DIM` + the migration to the emitted size — one constant.

**Remaining open questions (non-blocking):**

- Confirm the exact `qwen3-embedding:8b` output dimension in your Ollama setup (see above).
- Should the mixed-class concurrency edge case (a remote generate whose only local touch is best-effort embedding) use the simple whole-job "local ⇒ global serial" rule, or the finer per-substep override in §9.2? Default = whole-job simple rule.
- Local image dir path/retention policy and whether images should be servable via a public route or an authenticated one once auth lands.
