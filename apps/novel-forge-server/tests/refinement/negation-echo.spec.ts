import { describe, expect, it } from 'bun:test';

import { type ChangeOp, findNegationEchoes, negationEchoWarnings, requestedNegations } from '@modules/refinement';

const BEFORE_BRIEF = [
  'Purpose: Orrin reaches the Saltvine archive before the tide bell and learns the Thornwake name.',
  '',
  'Beats:',
  '- Orrin, the lamplighters call him the Grey Warden, counts the days on a Mirecall almanac.',
  '- The ninth frostday is circled in red: the day the archive floods.',
  '- He meets Pell at the archive door.',
].join('\n');

const AFTER_BRIEF = [
  'Purpose: Orrin reaches the Saltvine archive before the tide bell.',
  '',
  'Beats:',
  '- Orrin is a quiet apprentice the lamplighters barely notice.',
  '- He meets Pell at the archive door.',
  '- No symbolic date, almanac, or foreshadowing of an ending.',
].join('\n');

describe('findNegationEchoes', () => {
  it('should flag the terms a brief removed by writing their absence', () => {
    const echoes = findNegationEchoes(BEFORE_BRIEF, AFTER_BRIEF);
    expect(echoes).toEqual([{ terms: ['almanac'], excerpt: 'No symbolic date, almanac, or foreshadowing of an ending' }]);
  });

  it('should flag every removed term inside one negated clause', () => {
    const before = 'Kestrel carries the Vantis compass and the brass ledger.';
    const after = 'Kestrel travels light, without the Vantis compass or brass ledger.';
    expect(findNegationEchoes(before, after)).toEqual([{ terms: ['vantis', 'compass', 'brass', 'ledger'], excerpt: after.slice(0, -1) }]);
  });

  it('should flag a removal written as "X is not"', () => {
    const before = 'The Glimmerfen oath binds every ferryman.';
    const after = 'The Glimmerfen oath is not part of this story.';
    expect(findNegationEchoes(before, after)).toEqual([{ terms: ['oath'], excerpt: 'The Glimmerfen oath is not part of this story' }]);
    expect(findNegationEchoes('Every ferryman swears the oath.', "The ferryman swears nothing. The oath isn't mentioned.")).toEqual([
      { terms: ['oath'], excerpt: "The oath isn't mentioned" },
    ]);
  });

  it('should flag "do not mention" and paired cues such as "free of" and "instead of"', () => {
    expect(findNegationEchoes('Mira hums the Harrowsong.', 'Mira works quietly. Do not mention the Harrowsong.')[0]?.terms).toEqual(['harrowsong']);
    expect(findNegationEchoes('The market sells embercoal.', 'The market is free of embercoal.')[0]?.terms).toEqual(['embercoal']);
    expect(findNegationEchoes('Tavi wields a thornwhip.', 'Tavi wields a staff instead of a thornwhip.')[0]?.terms).toEqual(['thornwhip']);
  });

  it('should not fire on a negation the old text already had', () => {
    const text = 'Orrin does not trust the Saltvine archivists. No lamp burns after the tide bell.';
    expect(findNegationEchoes(text, `${text} Pell waits outside.`)).toEqual([]);
  });

  it('should not fire on a new negation about something the old text never stated', () => {
    expect(findNegationEchoes('Orrin climbs the tower.', 'Orrin climbs the tower. Nobody follows him, and he does not look back.')).toEqual([]);
  });

  it('should not fire when the term is still stated plainly elsewhere', () => {
    const before = 'The almanac hangs by the door.';
    const after = 'The almanac hangs by the door. Orrin never opens the almanac.';
    expect(findNegationEchoes(before, after)).toEqual([]);
  });

  it('should not fire on a clean deletion', () => {
    expect(findNegationEchoes(BEFORE_BRIEF, AFTER_BRIEF.split('\n').slice(0, -1).join('\n'))).toEqual([]);
  });

  it.each([
    ['Mira suspects Kael is the spy.', 'Mira does not yet learn that Kael is the spy.'],
    ['Kael carries the Ashen Blade.', 'Kael no longer carries the Ashen Blade.'],
    ['Lena distrusts her brother.', "Lena doesn't distrust her brother anymore."],
    ['Orrin rejoins the caravan at the ford.', 'Orrin leaves at dawn. Never rejoins the caravan.'],
    ['Mira trusts the archivist.', 'Mira does not trust the archivist.'],
  ])('should not flag the plan sentence "%s" → "%s"', (before, after) => {
    expect(findNegationEchoes(before, after)).toEqual([]);
  });

  it('should not blame a named character for the copula after it', () => {
    expect(findNegationEchoes('Kael guards the gate.', 'Kael is not at the gate tonight.')).toEqual([]);
  });

  it('should not treat short or common words as salient', () => {
    expect(findNegationEchoes('She went with them to the inn.', 'She did not go with them to the inn.')).toEqual([]);
  });

  it('should skip exempt terms', () => {
    expect(findNegationEchoes(BEFORE_BRIEF, AFTER_BRIEF, { exempt: new Set(['almanac']) })).toEqual([]);
  });

  it('should fold simple plurals and possessives', () => {
    expect(findNegationEchoes('The almanacs line the shelf.', "There are no almanac's here.")[0]?.terms).toEqual(["almanac's"]);
  });
});

describe('requestedNegations', () => {
  it('should collect the terms an author asked to be written as absent', () => {
    expect([...requestedNegations('Add a line saying no almanac appears in the chapter.')]).toEqual(['almanac', 'appear']);
  });

  it('should ignore negations in a message that only asks for a removal', () => {
    expect(requestedNegations('Make Orrin an apprentice instead of the Grey Warden, without the almanac.').size).toBe(0);
  });
});

describe('negationEchoWarnings', () => {
  it('should word one warning per echoed clause and name the artifact', () => {
    const ops: ChangeOp[] = [
      { op: 'brief.update', chapter: 4, body: AFTER_BRIEF },
      { op: 'entity.upsert', entityKey: 'orrin', type: 'character', notes: 'Nobody calls him the Grey Warden.' },
      { op: 'premise.update', premise: 'No almanac anywhere.' },
    ];
    const baselines = new Map<string, Record<string, string | null>>([
      ['chapter:4', { title: 'The Tide Bell', body: BEFORE_BRIEF }],
      ['entity:orrin', { status: null, motivation: null, notes: 'Called the Grey Warden by the lamplighters.', body: null }],
    ]);

    expect(negationEchoWarnings(ops, baselines)).toEqual([
      'the chapter 4 brief drops "almanac" by stating its absence ("No symbolic date, almanac, or foreshadowing of an ending") — delete it instead of negating it',
      'the orrin entry drops "grey", "warden" by stating its absence ("Nobody calls him the Grey Warden") — delete it instead of negating it',
    ]);
  });

  it('should keep an untouched field as the baseline when comparing', () => {
    const ops: ChangeOp[] = [{ op: 'brief.update', chapter: 4, title: 'The Tide Bell, Rung' }];
    expect(negationEchoWarnings(ops, new Map([['chapter:4', { title: 'The Tide Bell', body: BEFORE_BRIEF }]]))).toEqual([]);
  });

  it('should skip a record the op creates', () => {
    expect(negationEchoWarnings([{ op: 'brief.update', chapter: 9, body: 'No almanac.' }], new Map())).toEqual([]);
  });
});
