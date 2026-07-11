/**
 * Importing npm packages
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export interface TotpOptions {
  /** Time-step size in seconds (RFC 6238 default). */
  stepSeconds?: number;
  /** Number of steps accepted on either side of the current one. */
  window?: number;
  /** Clock override for tests. */
  now?: number;
}

/**
 * Declaring the constants
 */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const CODE_DIGITS = 6;
const DEFAULT_STEP_SECONDS = 30;
const DEFAULT_WINDOW = 1;

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(encoded: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of encoded.toUpperCase().replace(/=+$/, '')) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(`Invalid base32 character: ${char}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** RFC 4226 HOTP: HMAC-SHA1 with dynamic truncation to a zero-padded 6-digit code. */
export function hotp(secret: Buffer, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', secret).update(message).digest();
  const lastByte = digest[digest.length - 1] as number;
  const offset = lastByte & 0x0f;
  const binary = ((digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** CODE_DIGITS).toString();
  return binary.padStart(CODE_DIGITS, '0');
}

/**
 * Verifies a TOTP code within the accept window and returns the matched time-step counter so the
 * caller can persist it for replay rejection, or null when no step matches. Comparison is
 * constant-time per candidate step.
 */
export function verifyTotp(secret: Buffer, code: string, options: TotpOptions = {}): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const stepSeconds = options.stepSeconds ?? DEFAULT_STEP_SECONDS;
  const window = options.window ?? DEFAULT_WINDOW;
  const currentStep = Math.floor((options.now ?? Date.now()) / 1000 / stepSeconds);

  for (let offset = -window; offset <= window; offset++) {
    const counter = currentStep + offset;
    if (counter < 0) continue;
    const expected = hotp(secret, counter);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(code))) return counter;
  }
  return null;
}

/** Builds the otpauth:// provisioning URI consumed by authenticator apps. */
export function buildOtpauthUri(issuer: string, account: string, secretBase32: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({ secret: secretBase32, issuer, algorithm: 'SHA1', digits: CODE_DIGITS.toString(), period: DEFAULT_STEP_SECONDS.toString() });
  return `otpauth://totp/${label}?${params.toString()}`;
}
