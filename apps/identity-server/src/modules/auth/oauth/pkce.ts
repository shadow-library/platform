/**
 * Importing npm packages
 */
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * PKCE (RFC 7636). Only S256 is supported: the plain method offers no protection and is disallowed
 * by OAuth 2.1.
 */

export function verifyPkce(verifier: string, challenge: string, method: string): boolean {
  if (method !== 'S256') return false;
  const computed = createHash('sha256').update(verifier).digest('base64url');
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}
