/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { ServerErrorCode } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export class AppErrorCode extends ServerErrorCode {
  /*!
   * Catalog Error Codes
   */

  /** The novel does not exist or has never been published */
  static readonly WBN_001 = AppErrorCode.notFound('WBN_001', 'Novel not found');
  /** The chapter ordinal does not exist for this novel */
  static readonly WBN_002 = AppErrorCode.notFound('WBN_002', 'Chapter not found');

  /*!
   * Publish Error Codes
   */

  /** Optimistic-concurrency rejection: the forge pushed a revision older than the stored one */
  static readonly WBN_003 = AppErrorCode.conflict('WBN_003', 'Stale publish rejected: incoming revision {incoming} is behind stored revision {stored}');
  /**
   * The slug already belongs to another published novel — a different source's, or another of the caller's
   * own, which a rename can also collide with. Shares its 409 with WBN_003 and means the opposite: a stale
   * publish is fatal, this one is answered by retrying under a slug the caller can hold, so publishers
   * discriminate on the code. The holder is never named — telling one publisher who holds a slug is the
   * very disclosure the ownership check exists to prevent.
   */
  static readonly WBN_010 = AppErrorCode.conflict('WBN_010', 'The novel slug is already published under a different novel');
  /**
   * The pushed `contentHash` does not match the hash recomputed from the pushed `title`/`content`/
   * `authorNote`. A malformed push, not a conflict — unlike WBN_003 (a stale but internally
   * consistent revision) and WBN_010 (a well-formed push against a slug this caller doesn't own).
   */
  static readonly WBN_011 = AppErrorCode.badRequest('WBN_011', 'The supplied contentHash does not match the pushed chapter payload');

  /*!
   * Session Error Codes
   */

  /** No valid reader session cookie accompanies the request */
  static readonly WBN_004 = AppErrorCode.unauthenticated('WBN_004', 'Authentication required');
  /** The OIDC login transaction is missing, tampered with, or expired */
  static readonly WBN_005 = AppErrorCode.badRequest('WBN_005', 'Login flow state is missing, invalid, or expired');

  /*!
   * Reader Error Codes
   */

  /** The reader has no recorded progress for this novel */
  static readonly WBN_006 = AppErrorCode.notFound('WBN_006', 'No reading progress recorded for this novel');

  /*!
   * Access Error Codes
   *
   * Both are contract violations by the forge, never by a reader — a reader who may not see a novel
   * is answered with WBN_001, indistinguishable from one that does not exist.
   */

  /** An `ORGANISATION` access push named no organisation to share with */
  static readonly WBN_007 = AppErrorCode.badRequest('WBN_007', 'Organisation visibility requires an organisation');
  /** A `PUBLIC` or `RESTRICTED` access push carried an organisation, which would be silently ignored */
  static readonly WBN_008 = AppErrorCode.badRequest('WBN_008', 'Only organisation visibility may name an organisation');

  /*!
   * Wiki Error Codes
   */

  /**
   * The wiki entry does not exist, or lies beyond the reader's furthest ordinal. The two are answered
   * identically and on purpose: an entry that appears only after a later chapter must not be confirmable
   * to exist by a reader who has not reached it, or its very presence spoils the reveal.
   */
  static readonly WBN_009 = AppErrorCode.notFound('WBN_009', 'Wiki entry not found');
}
