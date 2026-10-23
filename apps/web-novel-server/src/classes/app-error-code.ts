import { ServerErrorCode } from '@shadow-library/fastify';

export class AppErrorCode extends ServerErrorCode {
  /** Also answers a novel the caller may not read, indistinguishable from an unknown slug */
  static readonly WBN_001 = AppErrorCode.notFound('WBN_001', 'Novel not found');
  static readonly WBN_002 = AppErrorCode.notFound('WBN_002', 'Chapter not found');

  /** Optimistic-concurrency rejection: the forge pushed a revision older than the stored one */
  static readonly WBN_003 = AppErrorCode.conflict('WBN_003', 'Stale publish rejected: incoming revision {incoming} is behind stored revision {stored}');
  /** Slug held by another novel, or the novel belongs to another publisher. Retry under a different slug, unlike fatal WBN_003; the holder is never named. */
  static readonly WBN_010 = AppErrorCode.conflict('WBN_010', 'The novel slug is already published under a different novel');
  /** The pushed `contentHash` differs from the hash recomputed from `title`, `content`, `authorNote` and `contentRating`: a malformed push, not a conflict */
  static readonly WBN_011 = AppErrorCode.badRequest('WBN_011', 'The supplied contentHash does not match the pushed chapter payload');
  /** The `publishToken` differs from the one bound to this `(sourceClientId, sourceRef)` on first sight; an authorization refusal like WBN_010 */
  static readonly WBN_012 = AppErrorCode.conflict('WBN_012', 'The publish token does not match the token bound to this novel');

  static readonly WBN_004 = AppErrorCode.unauthenticated('WBN_004', 'Authentication required');
  static readonly WBN_005 = AppErrorCode.badRequest('WBN_005', 'Login flow state is missing, invalid, or expired');

  static readonly WBN_006 = AppErrorCode.notFound('WBN_006', 'No reading progress recorded for this novel');

  /** Forge contract violation: an `ORGANISATION` access push named no organisation */
  static readonly WBN_007 = AppErrorCode.badRequest('WBN_007', 'Organisation visibility requires an organisation');
  /** Forge contract violation: a `PUBLIC` or `RESTRICTED` access push carried an organisation, which would be silently ignored */
  static readonly WBN_008 = AppErrorCode.badRequest('WBN_008', 'Only organisation visibility may name an organisation');

  /** Missing and beyond-the-reader's-ordinal entries answer identically, so an unrevealed entry cannot be confirmed to exist */
  static readonly WBN_009 = AppErrorCode.notFound('WBN_009', 'Wiki entry not found');
}
