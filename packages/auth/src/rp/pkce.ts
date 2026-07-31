/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export interface PkcePair {
  verifier: string;
  challenge: string;
}

/**
 * Declaring the constants
 */
const encoder = new TextEncoder();

export function randomUrlSafeString(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Buffer.from(buffer).toString('base64url');
}

/** Generates an RFC 7636 S256 verifier/challenge pair */
export async function createPkcePair(): Promise<PkcePair> {
  const verifier = randomUrlSafeString(32);
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(verifier));
  return { verifier, challenge: Buffer.from(digest).toString('base64url') };
}
