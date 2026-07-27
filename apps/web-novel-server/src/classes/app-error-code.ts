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
}
