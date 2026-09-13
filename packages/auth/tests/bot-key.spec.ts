/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { BOT_KEY_PREFIX, botKeyIdToUuid, formatBotKey, isBotKeyShaped, parseBotKey } from '@shadow-library/auth';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The vector was computed independently of the SDK (Python's `zlib.crc32` and integer base62), so it
 * pins the wire format identity mints against rather than whatever this implementation happens to do.
 */
const VECTOR_UUID = '0190f5a2-7c3e-7d4b-9a1f-2b3c4d5e6f70';
const VECTOR_SECRET = Uint8Array.from({ length: 32 }, (_, index) => index);
const VECTOR_KEY = 'sl_bot_02xEokPYuqAXCFGP9guBLk_003aUlTJC7tjlCTQj2uNU3MFagCXG9LRKRcwGkBIDlf_1QWt8A';
const VECTOR_KEY_ID = '02xEokPYuqAXCFGP9guBLk';
const VECTOR_SECRET_SEGMENT = '003aUlTJC7tjlCTQj2uNU3MFagCXG9LRKRcwGkBIDlf';
const MAX_UUID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const BASE62_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const replaceSegment = (key: string, index: number, value: string): string => {
  const segments = key.slice(BOT_KEY_PREFIX.length).split('_');
  segments[index] = value;
  return `${BOT_KEY_PREFIX}${segments.join('_')}`;
};

describe('bot key format', () => {
  it('should format the known vector', () => {
    expect(formatBotKey(VECTOR_UUID, VECTOR_SECRET)).toBe(VECTOR_KEY);
  });

  it('should parse the known vector into its key id and secret segments', () => {
    expect(parseBotKey(VECTOR_KEY)).toEqual({ keyId: VECTOR_KEY_ID, secret: VECTOR_SECRET_SEGMENT });
  });

  it('should decode the vector key id back to its uuid', () => {
    expect(botKeyIdToUuid(VECTOR_KEY_ID)).toBe(VECTOR_UUID);
  });

  it('should round-trip freshly generated keys, including the widest and narrowest key ids', () => {
    for (const uuid of [crypto.randomUUID(), MAX_UUID, '00000000-0000-0000-0000-000000000000']) {
      const key = formatBotKey(uuid, crypto.getRandomValues(new Uint8Array(32)));
      expect(isBotKeyShaped(key)).toBe(true);
      expect(botKeyIdToUuid(parseBotKey(key)?.keyId ?? '')).toBe(uuid);
    }
  });

  it('should reject a key whose checksum does not match', () => {
    const tampered = replaceSegment(VECTOR_KEY, 1, `${VECTOR_SECRET_SEGMENT.slice(0, -1)}g`);
    expect(isBotKeyShaped(tampered)).toBe(true);
    expect(parseBotKey(tampered)).toBeNull();
    expect(parseBotKey(replaceSegment(VECTOR_KEY, 2, '1QWt8B'))).toBeNull();
  });

  it('should reject values that do not have the bot key structure', () => {
    const malformed = [
      '',
      'sl_bot_',
      VECTOR_KEY.replace('sl_bot_', 'sl_bat_'),
      `${VECTOR_KEY}_`,
      ` ${VECTOR_KEY}`,
      VECTOR_KEY.slice(0, -1),
      replaceSegment(VECTOR_KEY, 0, '02xEokPYuqAXCFGP9guBL-'),
      replaceSegment(VECTOR_KEY, 1, VECTOR_SECRET_SEGMENT.slice(1)),
    ];
    for (const value of malformed) {
      expect(isBotKeyShaped(value)).toBe(false);
      expect(parseBotKey(value)).toBeNull();
    }
    expect(parseBotKey(42)).toBeNull();
  });

  it('should reject a key id that overflows 128 bits even with a matching checksum', () => {
    const body = `${BOT_KEY_PREFIX}${'z'.repeat(22)}_${VECTOR_SECRET_SEGMENT}`;
    const overflowing = `${body}_${checksumOf(body)}`;
    expect(isBotKeyShaped(overflowing)).toBe(true);
    expect(parseBotKey(overflowing)).toBeNull();
  });

  it('should refuse to format a key from a non-uuid id or a secret of the wrong length', () => {
    expect(() => formatBotKey('not-a-uuid', VECTOR_SECRET)).toThrow();
    expect(() => formatBotKey(VECTOR_UUID, new Uint8Array(31))).toThrow();
  });
});

function checksumOf(body: string): string {
  let value = Bun.hash.crc32(body);
  let encoded = '';
  while (value > 0) {
    encoded = BASE62_ALPHABET.charAt(value % 62) + encoded;
    value = Math.floor(value / 62);
  }
  return encoded.padStart(6, '0');
}
