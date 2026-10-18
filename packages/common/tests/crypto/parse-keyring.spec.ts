import { describe, expect, it } from 'bun:test';
import { inspect } from 'node:util';

import { CryptoErrorCode, parseKeyring } from '@lib/crypto';

import { errorOf, KEY_ONE, KEY_TWO } from './crypto.fixtures';

const NON_CANONICAL_KEY = `${KEY_ONE.slice(0, -1)}B`;

describe('parseKeyring', () => {
  it('should make the first entry active and hold every entry', () => {
    const keyring = parseKeyring(`k2:${KEY_TWO},k1:${KEY_ONE}`);
    expect(keyring.activeKeyId).toBe('k2');
    expect([keyring.has('k1'), keyring.has('k2'), keyring.has('k3')]).toEqual([true, true, false]);
  });

  it('should tolerate whitespace around the value and its entries', () => {
    const keyring = parseKeyring(` k2:${KEY_TWO} ,\n k1:${KEY_ONE}\n`);
    expect([keyring.activeKeyId, keyring.has('k1')]).toEqual(['k2', true]);
  });

  it('should accept the longest key id the pattern allows', () => {
    expect(parseKeyring(`key-2026-10-abcd:${KEY_ONE}`).activeKeyId).toBe('key-2026-10-abcd');
  });

  it('should not expose key material through inspect or JSON', () => {
    const keyring = parseKeyring(`k1:${KEY_ONE}`);
    const hex = Buffer.from(KEY_ONE, 'base64url').toString('hex');
    for (const rendered of [inspect(keyring, { showHidden: true, depth: 5 }), JSON.stringify(keyring)]) {
      expect(rendered).not.toContain(KEY_ONE);
      expect(rendered).not.toContain(hex.slice(0, 16));
    }
  });

  it.each([
    ['an empty value', ''],
    ['a blank value', '  \n'],
    ['an empty entry', `k1:${KEY_ONE},`],
    ['an entry without a separator', KEY_ONE],
    ['an empty key id', `:${KEY_ONE}`],
    ['an upper-case key id', `K1:${KEY_ONE}`],
    ['a key id over 16 characters', `key-2026-10-abcde:${KEY_ONE}`],
    ['a key id with an underscore', `k_1:${KEY_ONE}`],
    ['a key of 31 bytes', `k1:${Buffer.alloc(31, 1).toString('base64url')}`],
    ['a key of 33 bytes', `k1:${Buffer.alloc(33, 1).toString('base64url')}`],
    ['a padded key', `k1:${KEY_ONE}=`],
    ['a key in standard base64', `k1:${Buffer.alloc(32, 0xfb).toString('base64')}`],
    ['a key with non-canonical trailing bits', `k1:${NON_CANONICAL_KEY}`],
    ['a key with an embedded space', `k1:${KEY_ONE.slice(0, 20)} ${KEY_ONE.slice(20)}`],
    ['a duplicate key id', `k1:${KEY_ONE},k1:${KEY_TWO}`],
  ])('should reject %s without echoing the value', (_, value) => {
    const error = errorOf(() => parseKeyring(value));
    expect(error.code).toBe(CryptoErrorCode.KEYRING_INVALID.code);
    expect(error.isInternal).toBe(true);
    const rendered = `${error.message} ${JSON.stringify(error.data)}`;
    for (const key of [KEY_ONE, KEY_TWO]) expect(rendered).not.toContain(key.slice(0, 12));
  });

  it('should name the failing entry by position', () => {
    expect(errorOf(() => parseKeyring(`k2:${KEY_TWO},k1:short`)).message).toContain('entry 2');
  });

  it('should reject a value that is not a string', () => {
    expect(errorOf(() => parseKeyring(undefined as unknown as string)).code).toBe(CryptoErrorCode.KEYRING_INVALID.code);
  });
});
