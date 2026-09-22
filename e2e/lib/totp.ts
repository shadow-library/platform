/**
 * Importing npm packages
 */
import { createHmac } from 'node:crypto';

/**
 * Importing user defined packages
 */

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

/** The code for the 30 s step containing `at`; pass `at + 30_000` for the next step when the current one was already spent. */
export function totpCode(secretBase32: string, at: number = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / STEP_SECONDS)));
  const digest = createHmac('sha1', base32Decode(secretBase32)).update(counter).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** CODE_DIGITS).toString().padStart(CODE_DIGITS, '0');
}
