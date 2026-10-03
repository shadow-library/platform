import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';

import { MAX_PASSAGE_CHARS, passageHash, selectionOf } from '../src/lib/passage-selection';

const BODY = 'Hollis kept the ledger in a tin box.\n\nThe pages inside were *swollen* with damp.\n\nNothing. No tick.';

describe('passageHash', () => {
  it('should hash the UTF-8 bytes as lowercase hex, matching the server', async () => {
    expect(await passageHash('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const text = '“Low Harrow paid” — é 🌊';
    expect(await passageHash(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
  });
});

describe('selectionOf', () => {
  it('should anchor on UTF-16 offsets with the end exclusive, so the slice is the passage', () => {
    const body = 'Sea 🌊 wall';
    const result = selectionOf(body, 4, 6);
    expect(result).toEqual({ kind: 'ok', selection: { start: 4, end: 6, text: '🌊' } });
  });

  it('should drop surrounding whitespace and accept a backwards drag', () => {
    expect(selectionOf(BODY, 38, 35)).toEqual({ kind: 'ok', selection: { start: 35, end: 36, text: '.' } });
    expect(selectionOf('  word  ', 0, 8)).toEqual({ kind: 'ok', selection: { start: 2, end: 6, text: 'word' } });
  });

  it('should refuse an empty or over-long selection', () => {
    expect(selectionOf(BODY, 36, 38)).toEqual({ kind: 'empty' });
    expect(selectionOf('x'.repeat(MAX_PASSAGE_CHARS + 1), 0, MAX_PASSAGE_CHARS + 1)).toEqual({ kind: 'too-long' });
  });
});
