import assert from 'node:assert';
import { createHash, randomBytes } from 'node:crypto';
import { crc32 } from 'node:zlib';

export interface GeneratedBotKey {
  key: string;
  keyPrefix: string;
  secretHash: string;
}

export interface ParsedBotKey {
  keyId: string;
  secret: string;
}

export const BOT_KEY_PREFIX = 'sl_bot_';
export const BOT_KEY_DISPLAY_PREFIX_LENGTH = 16;
export const BOT_CLIENT_ID_PREFIX = 'bot_';

const BASE62_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE62 = BigInt(BASE62_ALPHABET.length);
const KEY_ID_LENGTH = 22;
const SECRET_LENGTH = 43;
const CHECKSUM_LENGTH = 6;
const SECRET_BYTES = 32;
const CLIENT_ID_BYTES = 16;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BOT_KEY_PATTERN = new RegExp(`^${BOT_KEY_PREFIX}([0-9A-Za-z]{${KEY_ID_LENGTH}})_([0-9A-Za-z]{${SECRET_LENGTH}})_([0-9A-Za-z]{${CHECKSUM_LENGTH}})$`);
const MAX_KEY_ID = 1n << 128n;
const MAX_SECRET = 1n << 256n;

export function encodeBase62(value: bigint, length: number): string {
  assert(value >= 0n, 'Base62 encoding requires a non-negative integer');
  let encoded = '';
  for (let remaining = value; remaining > 0n; remaining /= BASE62) encoded = BASE62_ALPHABET[Number(remaining % BASE62)] + encoded;
  assert(encoded.length <= length, `Value does not fit in ${length} base62 characters`);
  return encoded.padStart(length, BASE62_ALPHABET[0]);
}

export function decodeBase62(encoded: string): bigint {
  let value = 0n;
  for (const character of encoded) {
    const digit = BASE62_ALPHABET.indexOf(character);
    assert(digit >= 0, 'Invalid base62 character');
    value = value * BASE62 + BigInt(digit);
  }
  return value;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  return bytes.reduce((value, byte) => (value << 8n) | BigInt(byte), 0n);
}

function uuidToBigInt(uuid: string): bigint {
  assert(UUID_PATTERN.test(uuid), 'Bot key id must be a lowercase uuid');
  return BigInt(`0x${uuid.replaceAll('-', '')}`);
}

function bigIntToUuid(value: bigint): string {
  const hex = value.toString(16).padStart(32, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function checksumOf(body: string): string {
  return encodeBase62(BigInt(crc32(Buffer.from(body, 'utf8'))), CHECKSUM_LENGTH);
}

export function formatBotKey(keyId: string, secretBytes: Uint8Array): string {
  assert(secretBytes.length === SECRET_BYTES, `Bot key secret must be ${SECRET_BYTES} bytes`);
  const body = `${BOT_KEY_PREFIX}${encodeBase62(uuidToBigInt(keyId), KEY_ID_LENGTH)}_${encodeBase62(bytesToBigInt(secretBytes), SECRET_LENGTH)}`;
  return `${body}_${checksumOf(body)}`;
}

export function parseBotKey(key: string): ParsedBotKey | null {
  const match = BOT_KEY_PATTERN.exec(key);
  if (!match) return null;

  const [, encodedKeyId, secret, checksum] = match as unknown as [string, string, string, string];
  if (checksumOf(`${BOT_KEY_PREFIX}${encodedKeyId}_${secret}`) !== checksum) return null;

  const keyId = decodeBase62(encodedKeyId);
  if (keyId >= MAX_KEY_ID || decodeBase62(secret) >= MAX_SECRET) return null;
  return { keyId: bigIntToUuid(keyId), secret };
}

export function hashBotKeySecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

export function generateBotKey(keyId: string): GeneratedBotKey {
  const key = formatBotKey(keyId, randomBytes(SECRET_BYTES));
  const parsed = parseBotKey(key);
  assert(parsed, 'Generated bot key failed to parse');
  return { key, keyPrefix: key.slice(0, BOT_KEY_DISPLAY_PREFIX_LENGTH), secretHash: hashBotKeySecret(parsed.secret) };
}

export function generateBotClientId(): string {
  return `${BOT_CLIENT_ID_PREFIX}${encodeBase62(bytesToBigInt(randomBytes(CLIENT_ID_BYTES)), KEY_ID_LENGTH)}`;
}
