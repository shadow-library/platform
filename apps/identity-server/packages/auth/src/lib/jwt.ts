/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { AuthError } from '../errors';
import { JwtPayload } from '../interfaces';

/**
 * Defining types
 */

export interface JwtHeader {
  alg?: string;
  typ?: string;
  kid?: string;
}

export interface DecodedJwt {
  header: JwtHeader;
  payload: JwtPayload;
  signingInput: Uint8Array;
  signature: Uint8Array;
}

export interface ClaimExpectations {
  issuer: string;
  audience: string;
  clockSkewSeconds: number;
  nonce?: string;
}

/**
 * Declaring the constants
 *
 * A minimal EdDSA-only JWT verifier on WebCrypto. Pinning a single algorithm at the codec level
 * removes the algorithm-confusion attack surface; `iss`, `aud`, and `exp` are always enforced.
 */
const encoder = new TextEncoder();

function decodeSegment<T>(segment: string, description: string): T {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T;
  } catch {
    throw new AuthError('TOKEN_INVALID', `malformed jwt ${description}`);
  }
}

export function decodeJwt(token: string): DecodedJwt {
  const segments = token.split('.');
  const [head, body, signature] = segments;
  if (segments.length !== 3 || !head || !body || !signature) throw new AuthError('TOKEN_INVALID', 'a jwt must have exactly three segments');
  return {
    header: decodeSegment<JwtHeader>(head, 'header'),
    payload: decodeSegment<JwtPayload>(body, 'payload'),
    signingInput: encoder.encode(`${head}.${body}`),
    signature: new Uint8Array(Buffer.from(signature, 'base64url')),
  };
}

export function validateClaims(payload: JwtPayload, expected: ClaimExpectations): void {
  const now = Math.floor(Date.now() / 1000);
  const skew = expected.clockSkewSeconds;

  if (payload.iss !== expected.issuer) throw new AuthError('ISSUER_MISMATCH', `token issued by '${String(payload.iss)}'`);
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(expected.audience)) throw new AuthError('AUDIENCE_MISMATCH', `token is not addressed to '${expected.audience}'`);
  if (typeof payload.exp !== 'number') throw new AuthError('TOKEN_INVALID', 'missing exp claim');
  if (payload.exp <= now - skew) throw new AuthError('TOKEN_EXPIRED', 'token has expired');
  if (typeof payload.nbf === 'number' && payload.nbf > now + skew) throw new AuthError('TOKEN_INVALID', 'token is not yet valid');
  if (expected.nonce !== undefined && payload.nonce !== expected.nonce) throw new AuthError('NONCE_MISMATCH', 'token nonce does not match the expected nonce');
}

export async function verifyJwt(token: string, getKey: (kid: string) => Promise<CryptoKey>, expected: ClaimExpectations): Promise<JwtPayload> {
  const { header, payload, signingInput, signature } = decodeJwt(token);
  if (header.alg !== 'EdDSA') throw new AuthError('ALG_REJECTED', `algorithm '${String(header.alg)}' is not allowed`);
  if (!header.kid) throw new AuthError('TOKEN_INVALID', 'missing kid header');

  const key = await getKey(header.kid);
  const isValid = await crypto.subtle.verify('Ed25519', key, signature, signingInput);
  if (!isValid) throw new AuthError('TOKEN_INVALID', 'signature verification failed');

  validateClaims(payload, expected);
  return payload;
}
