/**
 * Importing npm packages
 */
import { createHmac } from 'node:crypto';

/**
 * Importing user defined packages
 */
import { sleep } from './wait';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * RFC 6238 TOTP with identity's parameters (SHA-1, 6 digits, 30 s step), for answering a TOTP challenge from a spec.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const STEP_MS = STEP_SECONDS * 1000;
const CODE_DIGITS = 6;

export class TotpSecretError extends Error {
  override readonly name = 'TotpSecretError';
}

function base32Decode(encoded: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of encoded.toUpperCase().replace(/=+$/, '')) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new TotpSecretError(`invalid base32 character "${char}"`);
    value = (value << 5) | index;
    bits += 5;
    if (bits < 8) continue;
    bytes.push((value >>> (bits - 8)) & 0xff);
    bits -= 8;
  }
  return Buffer.from(bytes);
}

function stepAt(at: number): number {
  return Math.floor(at / STEP_MS);
}

/** The code for the 30 s step containing `at`; pass `at + 30_000` for the next step when the current one was already spent. */
export function totpCode(secretBase32: string, at: number = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(stepAt(at)));
  const digest = createHmac('sha1', base32Decode(secretBase32)).update(counter).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** CODE_DIGITS).toString().padStart(CODE_DIGITS, '0');
}

/**
 * An authenticator app for one seed. Identity accepts a code for the current step ±1 but only for a step above the last one it
 * accepted, so this hands out strictly increasing steps and waits for the clock when the next one is still two steps ahead.
 */
export class TotpAuthenticator {
  private lastStep: number;

  /** `lastUsedAt` is when identity last accepted a code from this seed, e.g. the activation. */
  constructor(
    readonly secret: string,
    lastUsedAt?: number,
  ) {
    this.lastStep = lastUsedAt === undefined ? -1 : stepAt(lastUsedAt);
  }

  async nextCode(): Promise<string> {
    const step = Math.max(this.lastStep + 1, stepAt(Date.now()));
    const waitMs = (step - 1) * STEP_MS - Date.now();
    if (waitMs > 0) await sleep(waitMs + 250);
    this.lastStep = step;
    return totpCode(this.secret, step * STEP_MS);
  }

  /** A well-formed code that matches no step identity would accept right now. */
  wrongCode(): string {
    const now = Date.now();
    const valid = new Set([-1, 0, 1].map(offset => totpCode(this.secret, now + offset * STEP_MS)));
    for (let candidate = 0; ; candidate++) {
      const code = candidate.toString().padStart(CODE_DIGITS, '0');
      if (!valid.has(code)) return code;
    }
  }
}
