import { describe, expect, it } from 'bun:test';

import { textDigest } from '@shadow-library/sdk';

describe('textDigest', () => {
  it('should match the published FNV-1a test vectors, so the server and the browser agree on every text', () => {
    expect(textDigest('')).toBe('811c9dc5');
    expect(textDigest('a')).toBe('e40c292c');
    expect(textDigest('foobar')).toBe('bf9cf968');
  });

  it('should tell a changed text from an unchanged one', () => {
    const notes = 'A tide clock that runs backwards.\n\nThe harbour closes at dusk.';

    expect(textDigest(notes)).toBe(textDigest(`${notes}`));
    expect(textDigest(notes)).not.toBe(textDigest(`${notes} `));
    expect(textDigest('café')).toHaveLength(8);
  });
});
