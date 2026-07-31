# Novel Import Format

A standalone authoring spec for the `novel-import` bundle: a single JSON document a person (or an
agent) can hand-write, containing an entire novel, and upload in one call to create a project and land
its chapters. This document is self-contained — no other file is required to author or import a valid
bundle.

This is the supply mechanism source projects now use for their chapters: the remote-acquisition pipeline
that used to fetch them was removed, and hand-authored (or otherwise externally produced) bundles take
its place for both source-material ingestion and finished-novel publishing.

## 1. Purpose and the two modes

A bundle has exactly one `mode`, chosen at authoring time:

- **`source`** — the bundle's chapters are raw source material. After import, the project behaves
  exactly like a `source`-kind project whose chapters arrived any other way: the existing
  extract → consolidate → skeleton pipeline runs on it, and the rebrand/reforge pipelines are available.
  Immediately after the chapters land, the server runs the same auto-recombine pass that used to fire on
  ingest completion — if any chapters look like translator-split parts of a single original chapter, it
  merges them and renumbers before anything else touches the project. This is a quiet best-effort pass;
  it never fails the import.
- **`final`** — the bundle's chapters ARE the finished novel. Chapters land locked, human-authored, and
  immediately publishable: `POST /api/v1/projects/:projectId/publish` followed by
  `POST /api/v1/projects/:projectId/chapters/:chapter/publish` (starting at chapter 1, in order) succeeds
  with no further editing, because the import's derived numbering is contiguous from 1 and every chapter
  is written locked with non-empty content — exactly what the publishing gates require.

Nothing else about the two modes differs: the bundle format, validation, and endpoint are identical:
only `mode` changes what happens to the project and its chapters after a valid bundle is accepted.

## 2. Endpoint

```
POST /api/v1/import
Authorization: Bearer <token>   (same bearer auth as every other /api/v1 route)
Content-Type: application/json

{ "bundle": <NovelBundle> }
```

- **202 Accepted** — `{ "projectId": "<bigint-as-string>", "jobId": "<uuid>" }`. The project row is
  created synchronously (inside the same database transaction that enqueues the job); chapter insertion
  and cover storage happen asynchronously in that job.
- **422** — the bundle failed validation. See §8. **Nothing is written** — no project, no job, no
  chapters — when a 422 is returned.
- Track import progress with the existing jobs endpoint: `GET /api/v1/jobs/:jobId`, returning
  `{ id, projectId, kind: "import", status: "pending" | "in_progress" | "done" | "failed", progress: { done, total, current, phase }, lastError, ... }`.
  `phase` is `"inserting"` while chapters land (`source` mode only, then) `"recombining"` for the final
  auto-recombine pass.

## 3. Envelope

| Field          | Type    | Required | Constraint                                         |
| -------------- | ------- | -------- | --------------------------------------------------- |
| `format`       | string  | yes      | must equal exactly `"novel-import"`                  |
| `schemaVersion`| integer | yes      | must equal exactly `1` (the only version this server currently accepts) |
| `mode`         | string  | yes      | `"final"` or `"source"`                              |
| `novel`        | object  | yes      | see §4                                               |
| `volumes`      | array   | yes      | min 1 item; see §5                                   |
| `assets`       | array   | no       | see §6                                               |

## 4. `novel` — metadata

| Field          | Type       | Required | Constraint / maps to                                                                 |
| -------------- | ---------- | -------- | -------------------------------------------------------------------------------------- |
| `title`        | string     | yes      | non-empty. Stored as both `projects.name` and `projects.title`.                        |
| `synopsis`     | string     | yes      | non-empty. Stored as `projects.brief` — the same "overview" field the app's premise/refinement tooling reads and the export package renders as the novel's description. |
| `genre`        | string     | no       | accepted and validated, but **not currently persisted** — the `projects` table has no evidenced genre column today (the AI premise pipeline's own `genre` field is likewise ephemeral, never written to a column). Reserved for a future column or web surface. |
| `tags`         | string[]   | no       | stored as `projects.themes` — the same jsonb array the novel export package reads back out as `tags`. |
| `cover`        | string     | no       | must equal the `name` of an entry in `assets` (§6). Omit if the novel has no cover.     |
| `instructions` | string     | no       | stored as `projects.instructions` — author chapter-writing instructions. Omitted, the project falls back to the app's default writing instructions, identical to a project created without instructions. |

## 5. `volumes` — ordered groups, min 1

| Field      | Type    | Required | Constraint                                                        |
| ---------- | ------- | -------- | -------------------------------------------------------------------- |
| `ordinal`  | integer | yes      | `>= 1`; unique across the bundle; **contiguous starting at 1** (1, 2, 3, … — no gaps, no repeats) |
| `title`    | string  | no       | display-only, for the author's own organization                    |
| `chapters` | array   | yes      | min 1 item; see below                                               |

Each entry in `chapters`:

| Field     | Type   | Required | Constraint                          |
| --------- | ------ | -------- | -------------------------------------- |
| `title`   | string | yes      | non-empty                             |
| `content` | string | yes      | non-empty, and not whitespace-only     |

### Chapter numbering is derived — never authored

**No chapter carries an explicit number, anywhere in the bundle.** The server computes global chapter
numbers by:

1. Sorting `volumes` by `ordinal` ascending.
2. Within each volume, taking `chapters` in array order (the order you list them).
3. Concatenating all of those chapter lists end-to-end and numbering the result `1, 2, 3, …`.

So volume ordinal 1's chapters become 1..N, volume ordinal 2's chapters continue at N+1, and so on. This
is the *only* place chapter numbers come from — reordering a volume's `ordinal`, or reordering chapters
within a volume's array, changes the resulting numbers.

### Volumes are organizational only

Volumes exist purely to give the author a way to group and order chapters while writing the bundle.
**Nothing in the database stores volumes for an imported project** — after import, the project has
`chapters` numbered 1..N as described above, and no volume records at all. If you need volume/arc
planning inside the app after import, use the separate plan-import flow (`docs/plan-import-design.md`)
against the resulting project.

## 6. `assets` — optional, only used for the cover today

| Field        | Type   | Required | Constraint                                                       |
| ------------ | ------ | -------- | -------------------------------------------------------------------- |
| `name`       | string | yes      | slug pattern `^[a-z0-9][a-z0-9-]*$`; unique across the bundle         |
| `mimeType`   | string | yes      | one of `image/png`, `image/jpeg`, `image/webp`                       |
| `dataBase64` | string | yes      | non-empty base64-encoded bytes, **no** `data:` URL prefix             |

To give the novel a cover, add one entry to `assets` and set `novel.cover` to that entry's `name`. The
asset is decoded and stored through the same on-disk storage path (`ImageStorageProvider`) the app uses
for every other cover/portrait upload, then referenced from `projects.coverImagePath` exactly like a
cover set through `POST /api/v1/projects/:projectId/cover` — it resolves at
`GET /api/v1/images/:projectId/:filename` once the import job has stored it (this happens inside the
job, not synchronously at request time — check `GET /api/v1/jobs/:jobId` for completion first).

An asset not referenced by `novel.cover` is accepted but currently unused — reserved for a future asset
kind (e.g. character portraits).

## 7. Size limits

- **Transport limit**: the server's global HTTP body limit is 64MB. A request body larger than that is
  rejected at the transport layer before any application code runs (a plain 413, not a field error).
- **Bundle content sanity check**: independent of the transport limit, `validateNovelBundle` sums every
  chapter's UTF-8 byte length plus every asset's estimated decoded byte size, and rejects anything over
  **48MB** with a clear field error (`bundle`) — comfortably under the transport ceiling, so a pathological
  bundle gets a readable validation message instead of a bare 413.
- For scale: a very large novel (hundreds of chapters at a few thousand words each) is typically a few
  MB of text; a cover image rarely exceeds a couple of MB even base64-encoded. Both limits have generous
  headroom over realistic bundles.

## 8. Validation behavior

Validation happens in two layers, and **either layer failing rejects the whole request before any
database write** — no project, no job, no chapters:

1. **Shape validation** (AJV, via the class-schema DTOs): every field above's type, required/optional-
   ness, pattern, and enum. This includes the envelope literals (`format`, `schemaVersion`, `mode`).
2. **Cross-item validation** (`validateNovelBundle`, a pure function — no I/O): checks the DTO layer
   cannot express on its own:
   - volume `ordinal` values are unique and contiguous starting at 1;
   - `novel.cover`, if set, names an asset that actually exists in `assets`;
   - no two assets share a `name`;
   - no chapter's `content` is empty or whitespace-only (a defense-in-depth check beyond the DTO's
     `minLength: 1`, which whitespace alone satisfies);
   - the total-size sanity check from §7.

Every failure — from either layer — surfaces as an HTTP **422** (the shared `ValidationError` shape every
`@shadow-library/fastify` route uses for both AJV and hand-thrown field errors) with a field-error list:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Validation Error",
  "fields": [
    { "field": "volumes", "msg": "volume ordinals must be unique and contiguous starting at 1" },
    { "field": "novel.cover", "msg": "cover references unknown asset 'front'" }
  ]
}
```

## 9. Failure semantics after acceptance

Once a bundle is accepted (202), chapter insertion and cover storage happen inside the `import` job, in
batches, with progress reported through `GET /api/v1/jobs/:jobId`. If the job fails partway through (for
example, a chapter batch insert errors), the job is marked `failed` with `lastError` set — the project
row and whatever chapters had already landed are **left in place**, exactly like every other job executor
in this server (nothing auto-rolls-back, nothing auto-deletes). Inspect the job and the project, and
either fix the underlying issue and re-import as a fresh bundle, or delete the project
(`DELETE /api/v1/projects/:projectId`) and start over.

## 10. Worked example

A complete, valid, two-volume, three-chapter `source`-mode bundle — no assets, ready to import as-is:

```json
{
  "format": "novel-import",
  "schemaVersion": 1,
  "mode": "source",
  "novel": {
    "title": "The Lantern Keeper",
    "synopsis": "A retired lighthouse keeper discovers the tide itself is listening, and it wants something back.",
    "tags": ["fantasy", "slow-burn"]
  },
  "volumes": [
    {
      "ordinal": 1,
      "title": "The Quiet Coast",
      "chapters": [
        {
          "title": "The Last Watch",
          "content": "Mira climbed the spiral stair for what she told herself was the last time, though she had said that every winter for eleven years. The lamp room smelled of brass polish and salt. Below, the sea moved the way it always moved at dusk — patient, unhurried, listening."
        },
        {
          "title": "A Voice in the Foam",
          "content": "The voice came again with the seventh wave, the way it always did. Mira had stopped telling herself it was the wind three years ago. 'I know you're there,' she said to the dark water, and for the first time, something answered."
        }
      ]
    },
    {
      "ordinal": 2,
      "title": "What the Tide Keeps",
      "chapters": [
        {
          "title": "The Debt",
          "content": "It wanted the lamp. Not the light it cast, but the fire itself, the one her grandmother had carried up these same stairs eighty years before. Mira understood, then, why the keeper's post had never once gone empty in three hundred years — and why it never would, until someone finally said no."
        }
      ]
    }
  ]
}
```

Importing this bundle derives three chapters, numbered by flattening the volumes in ordinal order:

| Global number | Title             | From volume (ordinal) |
| ------------- | ----------------- | ---------------------- |
| 1             | The Last Watch     | 1                       |
| 2             | A Voice in the Foam| 1                       |
| 3             | The Debt           | 2                       |

Because `mode` is `"source"`, the project is created with `kind: "source"`, the three chapters land with
`status: "done"` and the default `generator`, auto-recombine runs once they're in (a no-op here — nothing
looks like a split part), and the project is then ready for `POST /api/v1/projects/:projectId/extract`
exactly like any other source project.

To import the same story as a finished, publishable novel instead, the only change needed is
`"mode": "final"` — the resulting chapters would land `locked: true`, `generator: "human"`, ready for
`POST /api/v1/projects/:projectId/publish` and then
`POST /api/v1/projects/:projectId/chapters/1/publish`, `.../chapters/2/publish`, `.../chapters/3/publish`
in order.

### Adding a cover

To give the same bundle a cover, add an `assets` entry and reference it from `novel.cover`:

```json
{
  "novel": { "...": "...", "cover": "front" },
  "assets": [
    { "name": "front", "mimeType": "image/jpeg", "dataBase64": "<base64 bytes, no data: prefix>" }
  ]
}
```
