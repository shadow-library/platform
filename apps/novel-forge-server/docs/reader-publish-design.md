# Reader-Publish Design — pushing published novels to the reader service

Novel Forge is a fast-moving private workshop; the reading experience is a boring public shelf. This document specifies the boundary between them: the `novel-forge-reader`
service (separate repo, own database), the one-way publish pipeline that feeds it, and the segregation of concerns that keeps both sides recoverable. Drives checklist
tasks **PB1–PB5**.

## 1. Principle: ownership is decided by who can regenerate it

The forge can always regenerate the reader's content tables — drop them, re-push every publication record, converge to identical serving state. The reader can never
regenerate a draft, and the forge can never regenerate a reader's bookmarks. That is the segregation line, and it is testable: "wipe reader content and re-publish" is a
supported operation (§6).

Consequently the reader service is **not** the source of truth for published content — it is the _authoritative serving copy_ of a projection. The forge is the system of
record for everything authored **and for the publication ledger** (what was published, when, in what order, at which revision). Losing the reader database loses audience
data only; losing the publication ledger would lose release history and the ordinals that anchor reader URLs and progress — so the ledger lives in the forge.

## 2. Segregation of concerns

| concern                                           | system of record         | notes                                                |
| ------------------------------------------------- | ------------------------ | ---------------------------------------------------- |
| Bible, entities, canon facts, plans, arcs, briefs | novel-forge              | never leaves the forge                               |
| Drafts, revisions, judge results, AI runs         | novel-forge              | never leaves the forge                               |
| Finalized chapter content                         | novel-forge              | the master copy, forever                             |
| Publication decisions: what, when, in what order  | novel-forge              | `publications` / `chapter_publications` (§3)         |
| Rendered published copy readers see               | reader service (serving) | rebuildable projection (§6)                          |
| Reader accounts, sessions                         | reader service           | forge never touches these                            |
| Reading progress, bookmarks, library              | reader service           | originates there, stays there                        |
| Comments, ratings, view counts                    | reader service           | forge may _read_ via analytics endpoint, never write |

## 3. Forge-side schema (PB1)

```
publication_status         enum: 'draft' | 'live' | 'retired'
chapter_publication_status enum: 'scheduled' | 'published' | 'failed' | 'unpublished'

publications                    -- one per published novel
  id             bigserial PK
  project_id     bigint FK → projects (cascade), unique
  novel_slug     varchar NOT NULL UNIQUE      -- reader-facing, kebab-case, never changes
  title          varchar NOT NULL             -- reader-facing (may differ from working title)
  blurb          text
  cover_path     varchar
  status         publication_status NOT NULL DEFAULT 'draft'
  created_at / updated_at

chapter_publications            -- the publication ledger, one row per pushed chapter
  id                 bigserial PK
  project_id         bigint FK → projects (cascade)
  chapter            integer NOT NULL         -- forge chapter number at publish time
  published_ordinal  integer NOT NULL         -- reader-facing sequence; assigned once, never changes
  title              varchar NOT NULL
  author_note        text
  content_hash       varchar NOT NULL         -- hash of the rendered payload
  scheduled_at       timestamp
  published_at       timestamp
  status             chapter_publication_status NOT NULL DEFAULT 'scheduled'
  error              text                     -- last push failure, for the UI
  created_at / updated_at
  unique (project_id, published_ordinal)
```

`published_ordinal` is deliberately independent of forge chapter numbers: internal renumbering (e.g. recombine) must never move a reader URL, bookmark, or progress
pointer. It is assigned once at first publish (next ordinal in sequence) and re-derived from nothing.

Error codes: `PUB_001` (NOT_FOUND, publication not found), `PUB_002` (CLIENT_ERROR, chapter not finalized/approved — nothing unreviewed ever ships), `PUB_003`
(CLIENT_ERROR, ordinals must publish contiguously — no chapter 7 live before 6), `PUB_004` (SERVER_ERROR, reader service push failed — see the ledger row's `error`).

## 4. Publish semantics

- **Explicit, never automatic.** Chapter approval is an editorial gate; publication is a release decision. Nothing pushes without an author action (publish now, or
  schedule with `scheduledAt`). Scheduling runs forge-side on the existing jobs infrastructure — the reader stays dumb. (v2 option, not now: push early with a
  reader-side `visibleAt` gate, which survives forge downtime at release time and enables patron early access.)
- **Gates:** the chapter must be finalized/approved (`PUB_002`) and ordinals contiguous (`PUB_003`).
- **Edits after publish** (the Wattpad rule — every major platform allows silent post-publish edits): fix in the forge, republish. Same `PUT`, new `contentHash`, new
  reader-side revision (which doubles as the cache-invalidation signal). There is **no edit surface on the reader side**, not even an admin one.
- **Unpublish/stubbing** is first-class: `DELETE` on the reader, ledger row → `unpublished`. Re-publishing later reuses the same ordinal.
- **Payload is reader-clean:** title, prose rendered to the reader's format, author's note, word count, ordinal, hash. No forge internals (state jsonb, summaries,
  refs, judge output) ever cross the boundary.

## 5. Push protocol (PB2–PB3)

One-way HTTP, forge → reader, service-to-service bearer token (single shared secret; the `/internal/*` surface is never exposed publicly).

| call                                              | behavior                                                                                     |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `PUT /internal/novels/:slug`                      | novel metadata upsert (title, blurb, cover)                                                  |
| `PUT /internal/novels/:slug/chapters/:ordinal`    | chapter upsert — idempotent: same `contentHash` → no-op; different → replace + bump revision |
| `DELETE /internal/novels/:slug/chapters/:ordinal` | unpublish                                                                                    |
| `GET /internal/novels/:slug/manifest`             | `[{ordinal, contentHash}]` — the reconciliation primitive (§6)                               |

Flow: author action → gates → `chapter_publications` row (`scheduled`) → `publish` job (new `job_kind`) → executor renders payload → PUT → row `published` with
`publishedAt`. The ledger row **is** the outbox: a failed push stays `failed` with `error`, and job retries plus a janitor sweep (checkpoint-janitor pattern) re-push it.
Idempotent PUTs make every retry and replay safe.

Forge-side API (controller in the new `publishing` module): `POST /projects/:projectId/publish` (novel metadata + go-live), `POST /projects/:projectId/chapters/:n/publish`
(`{scheduledAt?}`), `DELETE .../chapters/:n/publish`, `GET /projects/:projectId/publications` (ledger + statuses for the UI).

## 6. Failure handling & reconciliation

- **Eventual consistency, forge-driven.** A reader outage delays publication; the ledger row stays `scheduled`/`failed` and the retry loop converges when it returns.
- **Drift healing:** `GET .../manifest` lets the forge diff reader state against the ledger and re-push mismatches. Exposed as `POST /projects/:projectId/publications/reconcile`.
- **Rebuild:** wiping the reader's content tables and running reconcile for every live publication must converge to identical serving state. This is the acceptance test
  for rule 3 (§9) and the disaster-recovery story.

## 7. Web UI (PB4, `novel-forge-web`)

Publish panel per project: novel metadata (slug/title/blurb/cover) editor, per-chapter publish/schedule/republish/unpublish actions with status chips from the ledger
(scheduled/published/failed + error), and a reconcile button.

## 8. Reader service spec (PB5, external repo `novel-forge-reader`)

Deliberately boring: Bun + Fastify (no DI framework needed), own small Postgres, no AI, no jobs.

```
novels              slug PK-ish, title, blurb, cover, status
published_chapters  (novel, ordinal) unique, title, content, author_note, content_hash, revision, word_count, published_at
users / sessions    reader auth
reading_progress    (user, novel) → ordinal + position
```

Public API: novel catalog/detail, chapter content (served cache-first: stable URLs, `ETag: contentHash`, modest `max-age` — internal cache keys include revision so a
republish is a natural miss), and small authenticated endpoints for progress/library. Internal API: §5. Content requests should overwhelmingly terminate at the cache;
the personalized calls are single-row lookups.

## 9. Hard rules

1. Content flows one direction: forge → reader. No exceptions.
2. The reader service never mutates published content; every fix is a forge republish.
3. The reader's content tables are a projection: dropping them and re-pushing the ledger must converge to identical serving state.
4. The forge never reads or writes reader-owned tables (accounts, progress, comments); audience data reaches the forge only through a read-only analytics endpoint, if ever.
5. Every push is idempotent, keyed `(novelSlug, publishedOrdinal)` + `contentHash`; retries and replays are always safe.
6. `publishedOrdinal` is assigned once by the forge and never re-derived from internal chapter numbers.
7. Nothing spoiler-grade ever appears in a push payload — the reader database must be printable on the inside of the front cover.
