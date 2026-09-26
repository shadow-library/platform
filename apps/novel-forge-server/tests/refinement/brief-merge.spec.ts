import { describe, expect, it } from 'bun:test';

import { mergeBriefUpdate } from '@modules/refinement/brief-merge';

const DEFAULTS = { volumeKey: 'v1', contentMode: 'standard' as const };

describe('mergeBriefUpdate', () => {
  it('should give a brief the op creates the defaults it does not name', () => {
    const merged = mergeBriefUpdate(undefined, { op: 'brief.update', chapter: 4, body: 'Mara leaves.' }, DEFAULTS);

    expect(merged).toMatchObject({ body: 'Mara leaves.', volumeKey: 'v1', contentMode: 'standard', isEnding: false, claimedMilestones: null });
  });

  it('should keep a stored brief’s own volume, even none, rather than the defaults', () => {
    const existing = mergeBriefUpdate(undefined, { op: 'brief.update', chapter: 4, body: 'Mara leaves.' }, { volumeKey: null, contentMode: 'unrestricted' });

    expect(mergeBriefUpdate(existing, { op: 'brief.update', chapter: 4, isEnding: true }, DEFAULTS)).toMatchObject({
      volumeKey: null,
      contentMode: 'unrestricted',
      isEnding: true,
    });
  });

  it('should normalise claims, clear what the op nulls and trim a blank point of view to none', () => {
    const existing = mergeBriefUpdate(undefined, { op: 'brief.update', chapter: 4, body: 'x', pov: 'mara', knowledgeContract: { pov: ['mara'], learns: [] } }, DEFAULTS);

    expect(mergeBriefUpdate(existing, { op: 'brief.update', chapter: 4, pov: ' ', knowledgeContract: null, claimedMilestones: [' rank_3 ', 'rank_3'] }, DEFAULTS)).toMatchObject({
      pov: null,
      knowledgeContract: null,
      claimedMilestones: ['rank_3'],
    });
  });
});
