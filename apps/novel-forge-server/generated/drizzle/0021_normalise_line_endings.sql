-- Every write path now folds `\r\n` and lone `\r` to `\n` before storing prose (see sanitizeMarkdown and the
-- hand-save/generation/chat-edit paths), but rows written before this change may still carry CRLF. This backfill
-- rewrites `drafts.body`, `chapters.content` and `draft_revisions.body` to match, and first touches the two hash
-- columns taken over a body's exact bytes so a review that read as current before the rewrite still does after
-- it: `finalize_reviews.source_hash` and `chapter_reviews.body_hash` both hash the same way `hashReviewedBody`
-- does (hex sha256 of the UTF-8 bytes), so the fix-up recomputes each hash from what the body will become, and
-- only where the stored hash still matches the body as it stands right now — a review that was already stale
-- before this migration (the body moved on for a real reason) stays stale after it.
--
-- It also marks every not-yet-pushed `chapter_publications` row (`scheduled`, or `failed`) whose chapter
-- currently holds CRLF with `crlf_rehash_since = now()`, taken *before* `chapters.content` is rewritten below so
-- the marker means exactly "this row's ledgered hash predates the CRLF fix". `PublicationJanitor`
-- (`reconcileCrlfContentHashes`) is the only thing that ever reads or clears that column: it adopts the fresh
-- `chapterContentHash` for a marked row only if the chapter has not been edited since the mark (`chapters.updated_at
-- <= crlf_rehash_since` — this migration never touches `updated_at`, so a real edit always fails that check), and
-- otherwise leaves its "canonical prose changed" conflict standing. Either way it clears the mark, so the repair
-- runs exactly once. `chapterContentHash`/`computeContentHash` (`@shadow-library/sdk/publishing`) hash a
-- JSON-canonicalized payload, not raw bytes, so recomputing it is TS-only work no SQL statement here could do.
--
-- Side effects this migration does not (and, from SQL alone, cannot) repair:
--   * A `chapter_reviews` row pinned to an older revision than its draft's current one is left untouched: it is
--     already stale by `isReviewStale`'s revision check regardless of its hash, so there is nothing to fix.
--   * An open `passage_suggestions` row whose anchored passage contained CRLF will read as stale next time it
--     is applied (`locatePassage` falls through to `STALE`) — a soft, user-facing "request a new suggestion",
--     never a hard failure or lost data, so it is left alone rather than migrated.
--   * A pending `refinement_proposals` row (chat draft edits awaiting apply, or a card kept for `revert`) that
--     captured a `draft:<chapter>` artifact in its `preState`/`postState` recomputes that draft's hash live at
--     apply/revert time (`artifact-state.ts`); against a CRLF-normalized body it will no longer match the
--     CRLF-era snapshot, so the proposal reads as `conflicted` (`RFN_003`/`RFN_006`) on its next apply or revert.
--     This fails safe — the author sees a conflict and re-decides rather than the system silently applying or
--     reverting against text it no longer matches — so it is left as-is rather than patched.

-- Only the review's current revision can be repaired without ambiguity: `d.body` IS the canonical text for
-- `cr.draft_revision = d.revision`, so no `draft_revisions` lookup is needed for it — and none would be
-- reliable, since `pruneDraftHistory` can retire an old revision's row before this migration ever runs, which
-- silently dropped these rows from an earlier version of this fix-up that joined through `draft_revisions`
-- unconditionally. A review pinned to an older revision is already stale by `isReviewStale`'s revision check
-- regardless of what its hash says, so it is left untouched rather than chased through history at all.
UPDATE "chapter_reviews" cr
SET "body_hash" = encode(sha256(convert_to(replace(replace(d."body", E'\r\n', E'\n'), E'\r', E'\n'), 'UTF8')), 'hex')
FROM "drafts" d
WHERE cr."project_id" = d."project_id"
  AND cr."chapter" = d."chapter"
  AND cr."draft_revision" = d."revision"
  AND cr."body_hash" = encode(sha256(convert_to(d."body", 'UTF8')), 'hex')
  AND position(chr(13) in d."body") > 0;
--> statement-breakpoint

-- A review with no draft revision was taken against a finalized chapter landed with no draft row; its staleness
-- reads off `chapters.content` alone (see the column comment on chapter_reviews.draft_revision).
UPDATE "chapter_reviews" cr
SET "body_hash" = encode(sha256(convert_to(replace(replace(c."content", E'\r\n', E'\n'), E'\r', E'\n'), 'UTF8')), 'hex')
FROM "chapters" c
WHERE cr."project_id" = c."project_id"
  AND cr."chapter" = c."number"
  AND cr."draft_revision" IS NULL
  AND cr."body_hash" = encode(sha256(convert_to(c."content", 'UTF8')), 'hex')
  AND position(chr(13) in c."content") > 0;
--> statement-breakpoint

UPDATE "finalize_reviews" fr
SET "source_hash" = encode(sha256(convert_to(replace(replace(d."body", E'\r\n', E'\n'), E'\r', E'\n'), 'UTF8')), 'hex')
FROM "drafts" d
WHERE fr."draft_id" = d."id"
  AND fr."source_hash" = encode(sha256(convert_to(d."body", 'UTF8')), 'hex')
  AND position(chr(13) in d."body") > 0;
--> statement-breakpoint

-- Marked before the rewrite below, so the marker always reflects a chapter that genuinely held CRLF.
UPDATE "chapter_publications" cp
SET "crlf_rehash_since" = now()
FROM "chapters" c
WHERE cp."project_id" = c."project_id"
  AND cp."chapter" = c."number"
  AND cp."status" IN ('scheduled', 'failed')
  AND position(chr(13) in c."content") > 0;
--> statement-breakpoint

UPDATE "drafts" SET "body" = replace(replace("body", E'\r\n', E'\n'), E'\r', E'\n') WHERE position(chr(13) in "body") > 0;
--> statement-breakpoint

UPDATE "chapters" SET "content" = replace(replace("content", E'\r\n', E'\n'), E'\r', E'\n') WHERE position(chr(13) in "content") > 0;
--> statement-breakpoint

UPDATE "draft_revisions" SET "body" = replace(replace("body", E'\r\n', E'\n'), E'\r', E'\n') WHERE position(chr(13) in "body") > 0;
