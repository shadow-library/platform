/**
 * Importing npm packages
 */
import { createHmac, createPublicKey, generateKeyPairSync, type JsonWebKey, randomBytes, sign, verify } from 'node:crypto';

import { type APIRequestContext } from '@playwright/test';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export type JwtClaims = Record<string, unknown>;

export interface DecodedJwt {
  readonly header: JwtClaims;
  readonly payload: JwtClaims;
  /** The base64url segments exactly as they appeared in the token. */
  readonly segments: readonly [string, string, string];
}

export interface PublicJwk extends JsonWebKey {
  kid?: string;
  use?: string;
  alg?: string;
}

export interface Jwks {
  keys: PublicJwk[];
}

/**
 * Declaring the constants
 *
 * Decodes, verifies and tampers with the compact JWS tokens identity issues. Identity signs with Ed25519 (`alg: EdDSA`) and
 * publishes the public halves at `/.well-known/jwks.json`, so a spec checks a token the way a relying party would: by `kid`
 * against that document, never by trusting the payload it decoded.
 */

export class JwtError extends Error {
  override readonly name = 'JwtError';
}

function decodeSegment(segment: string, part: string): JwtClaims {
  try {
    const value: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as JwtClaims;
  } catch {
    throw new JwtError(`JWT ${part} is not base64url JSON`);
  }
  throw new JwtError(`JWT ${part} is not a JSON object`);
}

export function encodeJwtSegment(value: JwtClaims): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeJwt(token: string): DecodedJwt {
  const segments = token.split('.');
  if (segments.length !== 3) throw new JwtError(`expected a three-part JWS, got ${segments.length} part(s)`);
  const [header = '', payload = '', signature = ''] = segments;
  return { header: decodeSegment(header, 'header'), payload: decodeSegment(payload, 'payload'), segments: [header, payload, signature] };
}

export async function fetchJwks(ctx: APIRequestContext): Promise<Jwks> {
  const response = await ctx.get('/.well-known/jwks.json');
  if (response.status() !== 200) throw new JwtError(`jwks answered ${response.status()}`);
  return (await response.json()) as Jwks;
}

/** Verifies `token`'s EdDSA signature against the JWKS key named by its `kid`, returning the payload; throws on any mismatch. */
export function verifyJwt(token: string, jwks: Jwks): JwtClaims {
  const { header, payload, segments } = decodeJwt(token);
  if (header.alg !== 'EdDSA') throw new JwtError(`unexpected alg ${String(header.alg)}`);
  const jwk = jwks.keys.find(key => key.kid === header.kid);
  if (!jwk) throw new JwtError(`no JWKS key for kid ${String(header.kid)}`);
  if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519') throw new JwtError(`JWKS key ${String(header.kid)} is ${String(jwk.kty)}/${String(jwk.crv)}, not OKP/Ed25519`);
  const signed = Buffer.from(`${segments[0]}.${segments[1]}`, 'utf8');
  if (!verify(null, signed, createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(segments[2], 'base64url'))) throw new JwtError('signature does not verify');
  return payload;
}

/** `token` with its payload replaced and the original header and signature kept — what an attacker who can only edit claims produces. */
export function swapJwtPayload(token: string, patch: JwtClaims): string {
  const { payload, segments } = decodeJwt(token);
  return `${segments[0]}.${encodeJwtSegment({ ...payload, ...patch })}.${segments[2]}`;
}

/** An unsigned `alg: none` token carrying `token`'s claims. */
export function unsignedJwt(token: string): string {
  const { payload } = decodeJwt(token);
  return `${encodeJwtSegment({ alg: 'none', typ: 'JWT' })}.${encodeJwtSegment(payload)}.`;
}

/** A well-formed RS256 token signed by a keypair generated here, so its `kid` resolves to nothing a verifier holds. */
export function selfSignedJwt(claims: JwtClaims, kid = randomBytes(8).toString('hex')): string {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const signed = `${encodeJwtSegment({ alg: 'RS256', typ: 'JWT', kid })}.${encodeJwtSegment(claims)}`;
  return `${signed}.${sign('sha256', Buffer.from(signed, 'utf8'), privateKey).toString('base64url')}`;
}

/** A token whose header claims `HS256` and whose signature is an HMAC over `secret` — the algorithm-confusion probe against an asymmetric verifier. */
export function hmacJwt(claims: JwtClaims, secret: string, kid?: string): string {
  const signed = `${encodeJwtSegment({ alg: 'HS256', typ: 'JWT', ...(kid ? { kid } : {}) })}.${encodeJwtSegment(claims)}`;
  return `${signed}.${createHmac('sha256', secret).update(signed).digest('base64url')}`;
}
