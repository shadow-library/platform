# Ingest authentication — breaking change

**Status:** shipped. **Affects:** the external ingest CLI and the external translation app, both outside this repository.

The forge's own API keys are gone. `src/modules/api-key/`, the `api_keys` table and the `KEY_*` error codes were
deleted, and the whole ingest surface now authenticates with the platform's organisation bots.

## What changed

| Before                                                         | After                                                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `x-api-key: nfk_…`                                             | `Authorization: Bearer sl_bot_…`                                                            |
| Key minted at `POST /api/v1/api-keys`                          | Key minted by an organisation admin in identity (Organization › Bots)                       |
| `GET`/`DELETE /api/v1/api-keys[/:id]`                          | Gone — 404. Keys are listed, rotated and revoked in identity                                |
| `DELETE /api/v1/api-keys/current` (self-retirement)            | **Gone — 404.** A client cannot retire its own credential; an admin revokes it              |
| Key owner re-checked for `novel-forge:curate` on every request | Every caller re-checked for it: the bot's `Curated ingest · Write` grant, or a person's own |
| Ingested projects owned by the key's human owner               | Owned by the bot, `shared_with_org = true` so the organisation's curators edit them         |
| `ingest_audit_log.api_key_id`                                  | `actor_kind` + `actor_id`, plus `bot_key_id` when a bot called                              |

Routes, request bodies and status codes are otherwise unchanged: `PUT /api/v1/ingest/novels/:sourceRef`,
`PUT …/chapters/:sourceOrdinal`, `POST …/cover`, `GET …/manifest`, and the originals door at
`/api/v1/ingest/projects/:projectId/originals[/:chapter]`.

## Cutover order

The steps are not interchangeable. Repointing the CLI before the transfer runs breaks every novel it already
knows about, and nothing heals it afterwards.

1. An organisation admin creates a bot in identity, grants it **Novel Forge › Curated ingest › Write**, and
   generates a key. The `sl_bot_…` secret is shown once.
2. Deploy this change (migration 0037 drops `api_keys`). The old `nfk_` keys stop working at this moment —
   there is no compatibility window, by decision.
3. Run the transfer entry below, per curation organisation, dry-run first.
4. Only then repoint the CLI at `Authorization: Bearer sl_bot_…`.

**If step 4 runs before step 3**, the bot pushes a `sourceRef` that already names a project the curator still
owns. `upsertNovel` masks a project held by another owner as absent, so it tries to create one; the insert
hits the global unique on `projects.source_ref`, `onConflictDoNothing` returns no row, and the re-resolve
still cannot see the project — so the client gets `404 ING_001` on what it believes is a create. Every
chapter push for that novel then fails the same way. The create-or-return path can never take ownership of
an existing project, so this does not resolve itself: run the transfer, and the next push succeeds.

## What a client must do

Send the key as `Authorization: Bearer sl_bot_…` on every ingest call. Nothing else changes — same routes,
same bodies, same status codes.

Rotate by generating a second key (two may be active at once) and revoking the old one in identity — there is
no in-band retirement route to call any more.

A key with no curate grant is answered `403 IAM_002`; a malformed, revoked or expired one `401 IAM_001`. A
missing credential is also `401 IAM_001` — an `x-api-key` header is no longer read at all.

The permission gate is not bot-only. A person reaching these routes from the web app must hold
`novel-forge:curate` in their own organisation too, and is refused `403 IAM_002` without it — being signed in
is not enough. The check runs before the route's schema validation and before the project-ownership guard, so
a refusal never reveals whether a project or a source reference exists.

## Existing curated projects

Projects ingested before the cutover are still owned by the curator whose key created them, so the bot cannot
see them. Move them with the bundled one-off entry:

```bash
# dry run first — reports every project it would move and writes nothing
bun src/transfer-curated-projects.ts --org <organisationId> --bot <botId> --owner <userId>[,<userId>...] --before <deploy instant> --dry-run
bun src/transfer-curated-projects.ts --org <organisationId> --bot <botId> --owner <userId>[,<userId>...] --before <deploy instant>

# in a deployed image the entry sits next to the migration runner
bun dist/transfer-curated-projects.js --org 7 --bot 42 --owner 42 --before 2026-09-20T09:00:00Z
```

It reassigns the selected projects to the bot, stamps the organisation and sets `shared_with_org`.

Both bounds are mandatory in spirit and `--owner` is mandatory in fact, because **an ingested project is no
longer proof of a legacy one**: a person holding `novel-forge:curate` may still ingest, and keeps ownership
when they do. Migration 0037 backfills pre-cutover audit rows with `actor_kind = 'user'`, so no column tells
a backfilled row apart from a genuine human ingest — only the timestamp does. `--before` selects projects
with an ingest audit row older than that instant (pass the actual deploy time; the default is migration
0037's own date, which can only ever select too few), and `--owner` bounds the run to the curators whose
projects are being handed over — nothing links a pre-cutover project to an organisation, because that link
lived on `api_keys`.

Every run also reports `ingestedOnlyAfterCutover`: projects held by the named owners that were ingested, but
never before `--before`. A nonzero count is expected for anything a curator has ingested since the cutover —
and is the signal that `--before` was set earlier than the deployment if it is not. Without it a partial
transfer reports a plausible number and looks complete.

Re-running with the same arguments is a no-op: only user-owned projects are selected, and a transferred one
is bot-owned. That is the only idempotence it has. An unbounded run would take projects a curator
legitimately owns today, and a project handed back by `/internal/bots/:botId/transfer` keeps its old
`organisation_id`, so an unbounded run could also move it into a different organisation.

It does not move `illustrations` rows, which are reached through their project and only affect identity's
ownership counts.
