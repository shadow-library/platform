import { describe, expect, it } from 'bun:test';

import { isEnvelope } from '@lib/crypto';

import { KAT_ENVELOPE } from './crypto.fixtures';

describe('isEnvelope', () => {
  it('should accept a well-formed envelope', () => {
    expect(isEnvelope({ ...KAT_ENVELOPE })).toBe(true);
  });

  it('should accept a KMS key id as the kid', () => {
    expect(isEnvelope({ ...KAT_ENVELOPE, kid: 'arn:aws:kms:eu-west-1:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab' })).toBe(true);
  });

  it('should accept an envelope of an empty plaintext', () => {
    expect(isEnvelope({ ...KAT_ENVELOPE, ct: '' })).toBe(true);
  });

  it.each([[null], [undefined], ['envelope'], [1], [[KAT_ENVELOPE]]])('should reject %p', value => {
    expect(isEnvelope(value)).toBe(false);
  });

  it.each(['v', 'alg', 'kid', 'dek', 'iv', 'ct', 'tag'] as const)('should reject an envelope missing %s', field => {
    const { [field]: _, ...rest } = KAT_ENVELOPE;
    expect(isEnvelope(rest)).toBe(false);
  });

  it('should reject an envelope with an extra field', () => {
    expect(isEnvelope({ ...KAT_ENVELOPE, aad: 'x' })).toBe(false);
  });

  it.each([
    ['a second version', { v: 2 }],
    ['a string version', { v: '1' }],
    ['another algorithm', { alg: 'A128GCM' }],
    ['an empty kid', { kid: '' }],
    ['a numeric kid', { kid: 1 }],
    ['a kid with a newline', { kid: 'k1\nforged' }],
    ['a kid with a pipe', { kid: 'k1|x' }],
    ['a kid over 128 characters', { kid: 'k'.repeat(129) }],
    ['an empty data key', { dek: '' }],
    ['an 11-byte iv', { iv: Buffer.alloc(11).toString('base64url') }],
    ['a 15-byte tag', { tag: Buffer.alloc(15).toString('base64url') }],
    ['a padded tag', { tag: `${Buffer.alloc(16).toString('base64url')}==` }],
    ['a ciphertext with non-canonical trailing bits', { ct: 'AB' }],
    ['a ciphertext in standard base64', { ct: '+/+/' }],
    ['a buffer ciphertext', { ct: Buffer.from('x') }],
  ])('should reject %s', (_, override) => {
    expect(isEnvelope({ ...KAT_ENVELOPE, ...override })).toBe(false);
  });
});
