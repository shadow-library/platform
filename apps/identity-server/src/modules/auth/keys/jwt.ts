/**
 * Importing npm packages
 */
import { KeyObject, sign, verify } from 'node:crypto';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export interface JwtHeader {
  alg: 'EdDSA';
  typ: 'JWT';
  kid: string;
}

export type JwtClaims = Record<string, unknown>;

/**
 * Declaring the constants
 *
 * A minimal EdDSA (Ed25519) JWT codec built on node:crypto. It intentionally supports only EdDSA:
 * pinning a single algorithm at the codec level removes the algorithm-confusion attack surface.
 */

const encodeSegment = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');

export function encodeJwt(header: JwtHeader, claims: JwtClaims, privateKey: KeyObject): string {
  const signingInput = `${encodeSegment(header)}.${encodeSegment(claims)}`;
  const signature = sign(null, Buffer.from(signingInput), privateKey).toString('base64url');
  return `${signingInput}.${signature}`;
}

export function decodeJwtHeader(token: string): JwtHeader | null {
  const segment = token.split('.')[0];
  if (!segment) return null;
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString());
  } catch {
    return null;
  }
}

/** Verifies the signature only. Claim validation (iss/aud/exp) is the caller's responsibility. */
export function verifyJwtSignature(token: string, publicKey: KeyObject): JwtClaims | null {
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) return null;
  const isValid = verify(null, Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, 'base64url'));
  if (!isValid) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    return null;
  }
}
