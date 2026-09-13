/**
 * Importing npm packages
 */
import { crc32 } from 'node:zlib';

/**
 * Importing user defined packages
 */
import { AuthErrorCode } from '../errors';

/**
 * Defining types
 */

export interface ParsedBotKey {
  keyId: string;
  secret: string;
}

/**
 * Declaring the constants
 *
 * `sl_bot_<keyId>_<secret>_<checksum>`, every segment base62 so `_` stays an unambiguous delimiter. The
 * CRC-32 lets secret scanners and the SDK reject typos and random strings without a network call; it
 * is not a MAC, so a well-formed key still proves nothing until identity has exchanged it.
 */
export const BOT_KEY_PREFIX = 'sl_bot_';

const BASE62_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const KEY_ID_LENGTH = 22;
const SECRET_LENGTH = 43;
const CHECKSUM_LENGTH = 6;
const KEY_ID_BITS = 128n;
const SECRET_BITS = 256n;
const BOT_KEY_PATTERN = new RegExp(`^${BOT_KEY_PREFIX}([0-9A-Za-z]{${KEY_ID_LENGTH}})_([0-9A-Za-z]{${SECRET_LENGTH}})_([0-9A-Za-z]{${CHECKSUM_LENGTH}})$`);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_BYTES = 32;

function encodeBase62(value: bigint, width: number): string {
  let encoded = '';
  let remaining = value;
  while (remaining > 0n) {
    encoded = BASE62_ALPHABET.charAt(Number(remaining % 62n)) + encoded;
    remaining /= 62n;
  }
  return encoded.padStart(width, '0');
}

function decodeBase62(value: string): bigint {
  let decoded = 0n;
  for (const character of value) decoded = decoded * 62n + BigInt(BASE62_ALPHABET.indexOf(character));
  return decoded;
}

const fitsIn = (value: bigint, bits: bigint): boolean => value < 1n << bits;

const checksumOf = (body: string): string => encodeBase62(BigInt(crc32(body)), CHECKSUM_LENGTH);

/** Whether the value has the bot-key structure; says nothing about the checksum */
export function isBotKeyShaped(value: unknown): value is string {
  return typeof value === 'string' && BOT_KEY_PATTERN.test(value);
}

/** Validates structure, segment ranges and checksum; `null` for anything that could never be exchanged */
export function parseBotKey(value: unknown): ParsedBotKey | null {
  if (typeof value !== 'string') return null;
  const match = BOT_KEY_PATTERN.exec(value);
  if (!match) return null;

  const [, keyId = '', secret = '', checksum = ''] = match;
  if (!fitsIn(decodeBase62(keyId), KEY_ID_BITS) || !fitsIn(decodeBase62(secret), SECRET_BITS)) return null;
  if (checksumOf(`${BOT_KEY_PREFIX}${keyId}_${secret}`) !== checksum) return null;
  return { keyId, secret };
}

/** The uuid of the key row a parsed key id names, lower-case and hyphenated */
export function botKeyIdToUuid(keyId: string): string {
  const hex = decodeBase62(keyId).toString(16).padStart(32, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Assembles a bot key from the key row's uuid and 32 secret bytes */
export function formatBotKey(keyUuid: string, secret: Uint8Array): string {
  if (!UUID_PATTERN.test(keyUuid)) throw AuthErrorCode.BOT_KEY_INVALID.create({ reason: 'the key id must be a uuid' });
  if (secret.length !== SECRET_BYTES) throw AuthErrorCode.BOT_KEY_INVALID.create({ reason: `the secret must be ${SECRET_BYTES} bytes` });

  const keyId = encodeBase62(BigInt(`0x${keyUuid.replaceAll('-', '')}`), KEY_ID_LENGTH);
  const encodedSecret = encodeBase62(BigInt(`0x${Buffer.from(secret).toString('hex')}`), SECRET_LENGTH);
  const body = `${BOT_KEY_PREFIX}${keyId}_${encodedSecret}`;
  return `${body}_${checksumOf(body)}`;
}
