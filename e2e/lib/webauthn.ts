/**
 * Importing npm packages
 */
import { createHash, generateKeyPairSync, type KeyObject, randomBytes, sign } from 'node:crypto';

/**
 * Importing user defined packages
 */
import { requireProductUrl } from './env';

/**
 * Defining types
 */

/** The parts of identity's `register/options` answer an authenticator needs. */
export interface RegistrationOptionsLike {
  rp: { id?: string };
  user: { id: string };
  challenge: string;
}

/** The parts of an `options` answer (login, MFA or step-up) an authenticator needs. */
export interface AuthenticationOptionsLike {
  challenge: string;
  rpId?: string;
}

export interface AttestationBody {
  id: string;
  rawId: string;
  type: 'public-key';
  response: { clientDataJSON: string; attestationObject: string; transports: string[] };
  authenticatorAttachment: string;
  label?: string;
}

export interface AssertionBody {
  id: string;
  rawId: string;
  type: 'public-key';
  response: { clientDataJSON: string; authenticatorData: string; signature: string; userHandle?: string };
  authenticatorAttachment: string;
}

export interface CeremonyOverrides {
  /** Signed instead of the challenge the options carry — the forged-challenge case. */
  challenge?: string;
  /** Emitted instead of the next count; a value below the stored one is the regression case. */
  signCount?: number;
  /** Default true. False clears the UV flag, which a first-factor or step-up ceremony demands. */
  userVerified?: boolean;
}

export interface AttestationOverrides extends CeremonyOverrides {
  label?: string;
}

/**
 * Declaring the constants
 *
 * A software WebAuthn authenticator: an ES256 key pair, `none` attestation and discoverable-credential assertions, built by
 * hand because the node runner has no authenticator and this workspace carries no WebAuthn dependency. It speaks exactly what
 * `@simplewebauthn/server` verifies on the other side — CBOR attestation objects, a COSE public key, and DER ECDSA signatures
 * over `authenticatorData || sha256(clientDataJSON)` — and exposes the signature counter, which no real authenticator would.
 */

const FLAG_USER_PRESENT = 0x01;
const FLAG_USER_VERIFIED = 0x04;
const FLAG_ATTESTED_CREDENTIAL_DATA = 0x40;
const COSE_KEY_TYPE_EC2 = 2;
const COSE_ALGORITHM_ES256 = -7;
const COSE_CURVE_P256 = 1;

export class SoftAuthenticatorError extends Error {
  override readonly name = 'SoftAuthenticatorError';
}

function cborHead(major: number, value: number): Buffer {
  if (value < 24) return Buffer.from([(major << 5) | value]);
  if (value < 0x100) return Buffer.from([(major << 5) | 24, value]);
  if (value < 0x10000) {
    const head = Buffer.alloc(3);
    head[0] = (major << 5) | 25;
    head.writeUInt16BE(value, 1);
    return head;
  }
  const head = Buffer.alloc(5);
  head[0] = (major << 5) | 26;
  head.writeUInt32BE(value, 1);
  return head;
}

function cborInt(value: number): Buffer {
  return value >= 0 ? cborHead(0, value) : cborHead(1, -value - 1);
}

function cborBytes(value: Buffer): Buffer {
  return Buffer.concat([cborHead(2, value.length), value]);
}

function cborText(value: string): Buffer {
  const bytes = Buffer.from(value, 'utf8');
  return Buffer.concat([cborHead(3, bytes.length), bytes]);
}

function cborMap(entries: readonly (readonly [Buffer, Buffer])[]): Buffer {
  return Buffer.concat([cborHead(5, entries.length), ...entries.flatMap(entry => [entry[0], entry[1]])]);
}

function coordinate(jwk: { x?: string; y?: string }, axis: 'x' | 'y'): Buffer {
  const value = jwk[axis];
  if (!value) throw new SoftAuthenticatorError(`generated EC key has no ${axis} coordinate`);
  return Buffer.from(value, 'base64url');
}

export class SoftAuthenticator {
  private readonly privateKey: KeyObject;
  private readonly coseKey: Buffer;
  private readonly credentialIdBytes = randomBytes(32);
  private readonly aaguid = Buffer.alloc(16);
  private readonly origin = requireProductUrl('identity');
  private relyingPartyId = new URL(this.origin).hostname;
  private userHandle: string | undefined;
  private counter = 0;

  constructor() {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const jwk = publicKey.export({ format: 'jwk' }) as { x?: string; y?: string };
    this.privateKey = privateKey;
    this.coseKey = cborMap([
      [cborInt(1), cborInt(COSE_KEY_TYPE_EC2)],
      [cborInt(3), cborInt(COSE_ALGORITHM_ES256)],
      [cborInt(-1), cborInt(COSE_CURVE_P256)],
      [cborInt(-2), cborBytes(coordinate(jwk, 'x'))],
      [cborInt(-3), cborBytes(coordinate(jwk, 'y'))],
    ]);
  }

  /** The credential id identity stores and addresses the passkey by. */
  get credentialId(): string {
    return this.credentialIdBytes.toString('base64url');
  }

  /** A `none`-attestation registration response over `options`' challenge, for `POST /api/v1/me/webauthn/register/verify`. */
  attest(options: RegistrationOptionsLike, overrides: AttestationOverrides = {}): AttestationBody {
    this.relyingPartyId = options.rp.id ?? this.relyingPartyId;
    this.userHandle = options.user.id;
    const clientDataJSON = this.clientData('webauthn.create', overrides.challenge ?? options.challenge);
    const attestedCredentialData = Buffer.concat([
      this.aaguid,
      Buffer.from([this.credentialIdBytes.length >> 8, this.credentialIdBytes.length & 0xff]),
      this.credentialIdBytes,
      this.coseKey,
    ]);
    const authData = this.authenticatorData(this.tally(overrides.signCount ?? this.counter), overrides.userVerified, attestedCredentialData);
    const attestationObject = cborMap([
      [cborText('fmt'), cborText('none')],
      [cborText('attStmt'), cborMap([])],
      [cborText('authData'), cborBytes(authData)],
    ]);

    return {
      id: this.credentialId,
      rawId: this.credentialId,
      type: 'public-key',
      response: { clientDataJSON, attestationObject: attestationObject.toString('base64url'), transports: ['internal'] },
      authenticatorAttachment: 'platform',
      ...(overrides.label ? { label: overrides.label } : {}),
    };
  }

  /** A discoverable-credential assertion over `options`' challenge, for `challenge/verify`, `/step-up` or a usernameless login. */
  assert(options: AuthenticationOptionsLike, overrides: CeremonyOverrides = {}): AssertionBody {
    this.relyingPartyId = options.rpId ?? this.relyingPartyId;
    const clientDataJSON = this.clientData('webauthn.get', overrides.challenge ?? options.challenge);
    const authData = this.authenticatorData(this.tally(overrides.signCount ?? this.counter + 1), overrides.userVerified);
    const signed = Buffer.concat([authData, createHash('sha256').update(Buffer.from(clientDataJSON, 'base64url')).digest()]);

    return {
      id: this.credentialId,
      rawId: this.credentialId,
      type: 'public-key',
      response: {
        clientDataJSON,
        authenticatorData: authData.toString('base64url'),
        signature: sign('sha256', signed, this.privateKey).toString('base64url'),
        ...(this.userHandle ? { userHandle: this.userHandle } : {}),
      },
      authenticatorAttachment: 'platform',
    };
  }

  /** A requested regression must not drag the next default count down with it, so the remembered tally only ever climbs. */
  private tally(count: number): number {
    this.counter = Math.max(this.counter, count);
    return count;
  }

  private clientData(type: 'webauthn.create' | 'webauthn.get', challenge: string): string {
    return Buffer.from(JSON.stringify({ type, challenge, origin: this.origin, crossOrigin: false }), 'utf8').toString('base64url');
  }

  private authenticatorData(signCount: number, userVerified = true, attestedCredentialData?: Buffer): Buffer {
    const header = Buffer.alloc(37);
    createHash('sha256').update(this.relyingPartyId).digest().copy(header, 0);
    header[32] = FLAG_USER_PRESENT | (userVerified ? FLAG_USER_VERIFIED : 0) | (attestedCredentialData ? FLAG_ATTESTED_CREDENTIAL_DATA : 0);
    header.writeUInt32BE(signCount, 33);
    return attestedCredentialData ? Buffer.concat([header, attestedCredentialData]) : header;
  }
}
