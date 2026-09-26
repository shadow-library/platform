import { describe, expect, it } from 'bun:test';

import { composePlanBody, CONTINUES_LINE } from '@server/common';

const GATE = { summary: 'Mara reaches the gate', pov: 'mara' };
const WAIT = { summary: 'Ren waits below', pov: null };

describe('composePlanBody', () => {
  it('should replace only the block of scene lines, keeping the author’s paragraphs and blank lines where they were', () => {
    const body = ['Mara tests the lamp.', '', 'Scene 1. Old one.', '', 'Scene 2. Old two.', '', 'Keep the tone quiet.', CONTINUES_LINE].join('\n');

    expect(composePlanBody(body, [GATE, WAIT])).toBe(
      ['Mara tests the lamp.', '', 'Scene 1. Mara reaches the gate. POV: mara.', 'Scene 2. Ren waits below.', '', 'Keep the tone quiet.', CONTINUES_LINE].join('\n'),
    );
  });

  it('should strip the scene block when the scene list is emptied', () => {
    const body = ['Mara tests the lamp.', '', 'Scene 1. Old one.', 'Scene 2. Old two.', '', 'Keep the tone quiet.'].join('\n');

    expect(composePlanBody(body, [])).toBe(['Mara tests the lamp.', '', '', 'Keep the tone quiet.'].join('\n'));
  });

  it('should place a first scene block before the continuation markers, or at the end', () => {
    expect(composePlanBody(`Mara tests the lamp.\n${CONTINUES_LINE}`, [WAIT])).toBe(`Mara tests the lamp.\nScene 1. Ren waits below.\n${CONTINUES_LINE}`);
    expect(composePlanBody('Mara tests the lamp.', [WAIT])).toBe('Mara tests the lamp.\nScene 1. Ren waits below.');
    expect(composePlanBody('', [WAIT])).toBe('Scene 1. Ren waits below.');
    expect(composePlanBody('Written by hand.', [])).toBe('Written by hand.');
  });
});
