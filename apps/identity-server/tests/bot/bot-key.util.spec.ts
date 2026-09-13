import { describe, expect, it } from 'bun:test';
import { crc32 } from 'node:zlib';

import { REGEX } from '@server/constants';
import { decodeBase62, encodeBase62, formatBotKey, generateBotClientId, generateBotKey, hashBotKeySecret, parseBotKey } from '@server/modules/identity/bot/bot-key.util';

const SCANNER_PATTERN = /^sl_bot_[0-9A-Za-z]{22}_[0-9A-Za-z]{43}_[0-9A-Za-z]{6}$/;

interface Vector {
  keyId: string;
  secretBytes: Uint8Array;
  key: string;
  secretHash: string;
}

const VECTORS: Vector[] = [
  {
    keyId: '01890a5d-ac96-774b-bcce-b302099a8057',
    secretBytes: Uint8Array.from({ length: 32 }, (_, index) => index),
    key: 'sl_bot_02tcRIyrxLXTR81B3dqdOx_003aUlTJC7tjlCTQj2uNU3MFagCXG9LRKRcwGkBIDlf_2EAxxu',
    secretHash: 'b0bd65ed3119037a4dcbf6b8138eb2f09de18490e98a773a68f9353f0c0331cd',
  },
  {
    keyId: '00000000-0000-0000-0000-000000000000',
    secretBytes: new Uint8Array(32),
    key: 'sl_bot_0000000000000000000000_0000000000000000000000000000000000000000000_4NTBUl',
    secretHash: 'b918b22a1581fedd39058065f00e6aad35bd561f20257151131a1ddcd21803de',
  },
  {
    keyId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    secretBytes: new Uint8Array(32).fill(0xff),
    key: 'sl_bot_7n42DGM5Tflk9n8mt7Fhc7_yhjskwdA6OZ1AL1YmHWZWm8LLG7HjnuCA2j5rOw8Xp1_1cEyOW',
    secretHash: '3b0167f1f41de3789d5785086c07b95c2926ebaf91e83d23d3e405cba9d478df',
  },
];

describe('bot-key codec', () => {
  describe('formatBotKey', () => {
    it('should produce the fixed vectors shared with the SDK parser', () => {
      for (const vector of VECTORS) expect(formatBotKey(vector.keyId, vector.secretBytes)).toBe(vector.key);
    });

    it('should reject a secret that is not 32 bytes', () => {
      expect(() => formatBotKey(VECTORS[0]!.keyId, new Uint8Array(31))).toThrow();
    });

    it('should reject a key id that is not a lowercase uuid', () => {
      expect(() => formatBotKey('01890A5D-AC96-774B-BCCE-B302099A8057', new Uint8Array(32))).toThrow();
    });
  });

  describe('parseBotKey', () => {
    it('should recover the key id and secret segment from the fixed vectors', () => {
      for (const vector of VECTORS) {
        const parsed = parseBotKey(vector.key);
        expect(parsed?.keyId).toBe(vector.keyId);
        expect(hashBotKeySecret(parsed!.secret)).toBe(vector.secretHash);
      }
    });

    it('should reject a key whose checksum does not match', () => {
      const tampered = `${VECTORS[0]!.key.slice(0, -1)}v`;
      expect(parseBotKey(tampered)).toBeNull();
    });

    it('should reject a typo in the secret even though the shape is intact', () => {
      const key = VECTORS[0]!.key;
      const index = key.indexOf('_', 7) + 5;
      const typo = `${key.slice(0, index)}${key[index] === 'a' ? 'b' : 'a'}${key.slice(index + 1)}`;
      expect(parseBotKey(typo)).toBeNull();
    });

    it('should reject malformed keys', () => {
      expect(parseBotKey('')).toBeNull();
      expect(parseBotKey('nfk_abcdef')).toBeNull();
      expect(parseBotKey(VECTORS[0]!.key.replace('sl_bot_', 'sl_bat_'))).toBeNull();
      expect(parseBotKey(`${VECTORS[0]!.key}x`)).toBeNull();
      expect(parseBotKey(VECTORS[0]!.key.replaceAll('_', '-'))).toBeNull();
    });

    it('should reject a key id segment that overflows 128 bits even with a valid checksum', () => {
      const body = `sl_bot_${'z'.repeat(22)}_${'0'.repeat(43)}`;
      expect(parseBotKey(`${body}_${encodeBase62(BigInt(crc32(body)), 6)}`)).toBeNull();
    });
  });

  describe('generateBotKey', () => {
    it('should expose only the display prefix and the secret hash besides the key itself', () => {
      const keyId = Bun.randomUUIDv7();
      const generated = generateBotKey(keyId);

      expect(generated.key).toMatch(SCANNER_PATTERN);
      expect(generated.keyPrefix).toBe(generated.key.slice(0, 16));
      expect(generated.secretHash).toMatch(/^[0-9a-f]{64}$/);
      expect(parseBotKey(generated.key)?.keyId).toBe(keyId);
      expect(hashBotKeySecret(parseBotKey(generated.key)!.secret)).toBe(generated.secretHash);
    });

    it('should never repeat a secret', () => {
      const keyId = Bun.randomUUIDv7();
      expect(generateBotKey(keyId).secretHash).not.toBe(generateBotKey(keyId).secretHash);
    });
  });

  describe('base62', () => {
    it('should round-trip and left-pad with zeros', () => {
      expect(encodeBase62(0n, 3)).toBe('000');
      expect(encodeBase62(61n, 2)).toBe('0z');
      expect(encodeBase62(62n, 2)).toBe('10');
      expect(decodeBase62('10')).toBe(62n);
    });

    it('should refuse a value wider than the requested length', () => {
      expect(() => encodeBase62(62n, 1)).toThrow();
    });
  });

  describe('generateBotClientId', () => {
    it('should match the reserved bot client id shape', () => {
      const clientId = generateBotClientId();
      expect(clientId).toMatch(REGEX.BOT_CLIENT_ID);
      expect(clientId).not.toMatch(REGEX.CLIENT_ID);
    });
  });
});
