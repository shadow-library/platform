/**
 * Importing npm packages
 */
import { createHash, randomBytes } from 'node:crypto';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

type CborValue = number | string | Uint8Array | { [key: string]: CborValue };

export interface EmulatedRegistration {
  id: string;
  rawId: string;
  type: 'public-key';
  response: { clientDataJSON: string; attestationObject: string; transports: string[] };
}

export interface EmulatedAssertion {
  id: string;
  rawId: string;
  type: 'public-key';
  response: { clientDataJSON: string; authenticatorData: string; signature: string; userHandle?: string };
}

/**
 * Declaring the constants
 */
const FLAG_UP = 0x01;
const FLAG_UV = 0x04;
const FLAG_AT = 0x40;

/** Minimal canonical CBOR encoder covering the value shapes WebAuthn attestation needs. */
function encodeCbor(value: CborValue | Map<number, CborValue>): Buffer {
  if (typeof value === 'number') {
    if (value >= 0) return encodeHead(0, value);
    return encodeHead(1, -1 - value);
  }
  if (typeof value === 'string') {
    const bytes = Buffer.from(value, 'utf8');
    return Buffer.concat([encodeHead(3, bytes.length), bytes]);
  }
  if (value instanceof Uint8Array) {
    const bytes = Buffer.from(value);
    return Buffer.concat([encodeHead(2, bytes.length), bytes]);
  }
  const entries: [Buffer, Buffer][] =
    value instanceof Map
      ? [...value.entries()].map(([key, entry]) => [encodeCbor(key), encodeCbor(entry)])
      : Object.entries(value).map(([key, entry]) => [encodeCbor(key), encodeCbor(entry)]);
  return Buffer.concat([encodeHead(5, entries.length), ...entries.flat()]);
}

function encodeHead(major: number, length: number): Buffer {
  if (length < 24) return Buffer.from([(major << 5) | length]);
  if (length < 256) return Buffer.from([(major << 5) | 24, length]);
  const head = Buffer.alloc(3);
  head[0] = (major << 5) | 25;
  head.writeUInt16BE(length, 1);
  return head;
}

/** Converts WebCrypto's raw `r||s` ECDSA signature into the DER form WebAuthn expects. */
function rawSignatureToDer(raw: Buffer): Buffer {
  const encodeInteger = (bytes: Buffer): Buffer => {
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) start++;
    let integer = bytes.subarray(start);
    const first = integer[0] as number;
    if (first & 0x80) integer = Buffer.concat([Buffer.from([0]), integer]);
    return Buffer.concat([Buffer.from([0x02, integer.length]), integer]);
  };
  const r = encodeInteger(raw.subarray(0, 32));
  const s = encodeInteger(raw.subarray(32, 64));
  return Buffer.concat([Buffer.from([0x30, r.length + s.length]), r, s]);
}

/**
 * A software WebAuthn authenticator: generates a P-256 credential and produces registration
 * attestations (fmt `none`) and assertions that verify against @simplewebauthn/server, so the
 * full ceremony is exercised end-to-end without a browser.
 */
export class WebauthnEmulator {
  private keyPair!: CryptoKeyPair;
  private readonly credentialId = randomBytes(32);
  counter = 0;

  constructor(
    private readonly rpId: string,
    private readonly origin: string,
  ) {}

  get credentialIdB64(): string {
    return this.credentialId.toString('base64url');
  }

  async init(): Promise<this> {
    this.keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    return this;
  }

  private clientData(type: 'webauthn.create' | 'webauthn.get', challenge: string): Buffer {
    return Buffer.from(JSON.stringify({ type, challenge, origin: this.origin, crossOrigin: false }), 'utf8');
  }

  private rpIdHash(): Buffer {
    return createHash('sha256').update(this.rpId).digest();
  }

  private counterBytes(counter: number): Buffer {
    const bytes = Buffer.alloc(4);
    bytes.writeUInt32BE(counter);
    return bytes;
  }

  async register(options: { challenge: string }): Promise<EmulatedRegistration> {
    const publicKeyRaw = Buffer.from(await crypto.subtle.exportKey('raw', this.keyPair.publicKey));
    const coseKey = new Map<number, CborValue>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, new Uint8Array(publicKeyRaw.subarray(1, 33))],
      [-3, new Uint8Array(publicKeyRaw.subarray(33, 65))],
    ]);

    const credentialData = Buffer.concat([Buffer.alloc(16), this.counterBytes(this.credentialId.length).subarray(2), this.credentialId, encodeCbor(coseKey)]);
    const authData = Buffer.concat([this.rpIdHash(), Buffer.from([FLAG_UP | FLAG_UV | FLAG_AT]), this.counterBytes(this.counter), credentialData]);
    const attestationObject = encodeCbor({ fmt: 'none', attStmt: {}, authData: new Uint8Array(authData) });

    return {
      id: this.credentialIdB64,
      rawId: this.credentialIdB64,
      type: 'public-key',
      response: {
        clientDataJSON: this.clientData('webauthn.create', options.challenge).toString('base64url'),
        attestationObject: attestationObject.toString('base64url'),
        transports: ['internal'],
      },
    };
  }

  async authenticate(options: { challenge: string }, override?: { counter?: number; userHandle?: string }): Promise<EmulatedAssertion> {
    this.counter = override?.counter ?? this.counter + 1;
    const authenticatorData = Buffer.concat([this.rpIdHash(), Buffer.from([FLAG_UP | FLAG_UV]), this.counterBytes(this.counter)]);
    const clientDataJSON = this.clientData('webauthn.get', options.challenge);
    const clientDataHash = createHash('sha256').update(clientDataJSON).digest();

    const payload = Buffer.concat([authenticatorData, clientDataHash]);
    const rawSignature = Buffer.from(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, this.keyPair.privateKey, payload));

    return {
      id: this.credentialIdB64,
      rawId: this.credentialIdB64,
      type: 'public-key',
      response: {
        clientDataJSON: clientDataJSON.toString('base64url'),
        authenticatorData: authenticatorData.toString('base64url'),
        signature: rawSignatureToDer(rawSignature).toString('base64url'),
        userHandle: override?.userHandle,
      },
    };
  }
}
