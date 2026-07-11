/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { Jwk, JwtPayload } from '../interfaces';

/**
 * Defining types
 */

export interface TestSigner {
  kid: string;
  publicJwk: Jwk & { kid: string };
  sign(claims: JwtPayload): Promise<string>;
}

/**
 * Declaring the constants
 */
const encoder = new TextEncoder();

const encodeSegment = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');

/** Creates an ephemeral Ed25519 signer for unit tests; the public JWK is ready to publish in a JWKS */
export async function createTestSigner(): Promise<TestSigner> {
  const pair = (await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as CryptoKeyPair;
  const kid = crypto.randomUUID();
  const jwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as Jwk;
  const publicJwk = { ...jwk, kid, alg: 'EdDSA', use: 'sig' };

  const sign = async (claims: JwtPayload): Promise<string> => {
    const signingInput = `${encodeSegment({ alg: 'EdDSA', typ: 'JWT', kid })}.${encodeSegment(claims)}`;
    const signature = await crypto.subtle.sign('Ed25519', pair.privateKey, encoder.encode(signingInput));
    return `${signingInput}.${Buffer.from(signature).toString('base64url')}`;
  };

  return { kid, publicJwk, sign };
}
