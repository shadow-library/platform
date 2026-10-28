# Web Novel

## Purpose

- The reading platform: readers browse a catalog, read chapters, keep a library and progress, and browse spoiler-gated wikis. Built to be public, but private until launch (see Access posture).
- Two apps: `web-novel-server` (JSON API + Postgres) and `web-novel-web` (TanStack Start SSR + PWA), meeting only at the JSON API. Authenticates via Identity.
- Offline/PWA is real. Anonymous library/progress live on the device and are never merged into an account; they exist only while the app is public.

## Architecture

- `novel-forge-server` owns content; `web-novel-server` holds a rebuildable serving copy. Flow is one-way, forge to reader; the reader never calls the forge
  and audience data (progress, library) never crosses back.
- Publishers are M2M clients of Identity, each needing a service-access rule (`/internal/*` refuses any non-service principal); a second publisher needs no schema or route change.
- When a publish payload gains a field, deploy `web-novel-server` before `novel-forge-server` (a convention: an old reader strips unknown fields, then fails the hash check).
- The forge converges in order: novel metadata, access list, chapters, wiki entries; all reader calls are idempotent. The forge's ledger is the outbox and
  revision source; reconcile diffs the reader's manifests against it and re-pushes drift; rows the ledger does not know are reported, never deleted. `ORGANISATION` membership is asked of `identity`; `RESTRICTED` grants live in Postgres.

## Access posture

- Pre-launch Web Novel is private through the two layers in `docs/packages.md` (Auth access mode): the application is `INTERNAL` in Identity (`docs/identity.md`) and the app defaults to `AUTH_ACCESS_MODE=private`,
  which requires an authenticated caller on every route except health and the SDK auth routes (`/internal/*` stays M2M scope-gated). The web app gates its whole shell and the reader the same way and is `noindex`.
- Going public is configuration only: `AUTH_ACCESS_MODE=public` and application visibility `PUBLIC`. Either alone does not open it. Do not add a code path that assumes one mode.
- Accepted gap: wiki and cover images live on the public storage origin and bypass the gate; anyone holding an asset URL can fetch it.

## Concepts

- `sourceRef`: the publisher's stable novel id (forge sends its `projectId`). With the client id it is the novel's identity; the slug is mutable.
- Visibility tier: `PUBLIC`, `ORGANISATION` (one organisation's members), `RESTRICTED` (a grant set). `status` (live/retired) is separate; retired is still served.
- Access has its own revision ladder, independent of the metadata revision. Revisions are forge-assigned, never generated here.
- Gate: the reader's `furthestOrdinal` (0 if anonymous, which is possible only in public mode). Wiki entries, facets and images carry the ordinal they unlock at.
- Chapter content is the publisher's GFM Markdown, stored and served verbatim; the reader renders it with the shared `renderChapterMarkdown` (`packages/sdk`), so
  ` ```system <Title> ` fences show as system panels and tables as scrollable tables. Its escaping is the reader's XSS defense: raw HTML never renders.
- Ratings: three dimensions per novel and, separately, per chapter. `NULL` means unrated, never `none`; catalog ceiling filters exclude unrated novels.

## Hard rules: publish

- Revision ladder (novel, access, chapter, wiki entry alike): incoming below stored is a fatal conflict, never retried; equal with identical content is a no-op; else replace.
- MUST resolve a novel by (client id, `sourceRef`), NEVER by slug; a new slug renames the row. A slug held by another novel is a retryable conflict: the forge ladders to a
  free slug and replays, renaming the reader's row; an exhausted ladder is terminal. Publishers MUST tell the two conflicts apart by code, not status.
- Ownership is by client id. Mutating a foreign slug conflicts; reading one is 404, like unknown (no oracle).
- Chapter push MUST carry a `contentHash` the server recomputes; mismatch is rejected. `publishToken` binds trust-on-first-use per novel; an absent token never enforces.
- Access push replaces tier, organisation and the whole grant set atomically; `ORGANISATION` requires an organisation, other tiers forbid one.
  Access MUST land before any chapter so a restricted novel is never briefly public.
- Wiki entry push replaces entry, facets and images atomically. Unpublish is idempotent. No endpoint deletes a novel; retire it.
- Every internal mutation writes exactly one publish-audit row, atomic with its decision, rejected calls included.
  `(novel, ordinal)` anchors URLs, bookmarks and progress; publishers MUST NOT renumber it.

## Hard rules: reading

- Every by-slug read goes through one access check; an unauthorized reader gets 404, never forbidden. Deny by default, including when Identity is unreachable.
- The catalog list is `PUBLIC`-only whoever asks. Library, progress and Shared listings MUST be filtered by current readability so revoked shares vanish
  (`RESTRICTED` immediately, `ORGANISATION` only after the membership cache lapses); removing from the library stays allowed after revocation.
- Non-public responses MUST be `private, no-store` (library and Shared set it; the progress routes currently do not). `cache-control: public` is allowed only for a `PUBLIC` novel while the app is
  public (a wiki read additionally only while anonymous); in private mode every catalog and wiki response is `private, no-store`, so a shared cache never holds what only a session may fetch.
- Wiki gating is done in SQL before load; entries beyond the gate answer 404, like missing. Chapters are not gated by progress.
  `furthestOrdinal` is monotonic and reader-declared: a spoiler gate, not a security control.
- In public mode, catalog and wiki reads treat a bad or lapsed credential (and bot keys) as anonymous, never 401; in private mode they require a session like everything else.
- Progress and library rows cascade from `novels`: deleting novel rows destroys audience data, so wipe-and-re-push is NOT harmless to readers.

## Hard rules: web

- NEVER duplicate server business rules or reach the database; call the API. A server contract change requires regenerating `api-types.gen.ts` and fixing callers.
- Per-user endpoints MUST live under `/api/library` or `/api/me`, the service worker's network-only patterns, or be added to them; anything under `/api/novels` is cached. Sign-out MUST purge account-scoped data (downloads, caches, query persister), namespaced by user id; only an explicit sign-out purges, and session expiry MUST never wipe downloads.
- Private mode and offline: the service worker installs only after sign-in, because the precache refuses a redirected or non-OK response and fails all-or-nothing, so the login page can never become the offline shell.
  The mode comes from the route gate and its query never expires from the cache, so offline navigation keeps working.
- Residual risk offline after an explicit sign-out in private mode: the precached shell can still show the catalog titles as of service-worker install time and the signed-out reader's opaque `sub`; downloads, chapters, library, progress and persisted queries are purged, and the shell is not dropped on logout because an active worker would not re-precache it until `sw.js` changes.
- Theme is platform-wide via a shared cookie; NEVER keep a second copy in app settings. Browser-only APIs and server-only imports need the SSR guards.

## Non-goals and open work

- No comments, ratings, views or notifications endpoint ("Updates" is derived client-side); no per-chapter access control.
  The web mature-content gate never triggers (no server `mature` flag) and client fields with no server source (`rating`, `views`) are placeholders, not bugs.
