import { describe, expect, it, mock, spyOn } from 'bun:test';
import { Logger } from '@shadow-library/common';

import { activePlaybookKeys, type ConceptCandidate, CONSTRAINT_PLAYBOOKS, getPlaybook, hasPlaybook, isOpenEndedLength, matchPlaybooks, QUESTION_BANK } from '@modules/ideation';
import { type Ideation } from '@server/database';

const constraint = (key: string, text: string, kind: Ideation.ConstraintKind = 'shape', playbookKey?: string): Ideation.SeedConstraint => ({
  key,
  kind,
  text,
  lockedBy: 'author',
  playbookKey,
});

const card = (overrides: Partial<ConceptCandidate> = {}): ConceptCandidate => ({
  title: 'Salvage Rites',
  logline: 'a salvager works a debt off a dead ship',
  engine: 'debt repaid in salvage',
  ladder: 'deeper wrecks, worse air',
  posture: 'grim and quiet',
  ...overrides,
});

describe('constraint playbooks', () => {
  it('should ship the eight shapes the studio launches with', () => {
    expect(CONSTRAINT_PLAYBOOKS.map(playbook => playbook.key)).toEqual([
      'dual-leads',
      'regression',
      'no-harem',
      'litrpg-system',
      'open-ended-length',
      'ensemble',
      'slow-burn',
      'single-pov',
    ]);
  });

  it('should give every playbook a promise, a kill, and a replacement', () => {
    expect(CONSTRAINT_PLAYBOOKS.every(playbook => playbook.promises.length > 40 && playbook.kills.length > 20 && playbook.mustReplace.length > 40)).toBe(true);
  });

  it('should name at least two failure modes per playbook', () => {
    expect(CONSTRAINT_PLAYBOOKS.every(playbook => playbook.failureModes.length >= 2)).toBe(true);
  });

  it('should force only question ids the bank actually holds', () => {
    const bankIds = new Set(QUESTION_BANK.map(question => question.id));
    const forced = CONSTRAINT_PLAYBOOKS.flatMap(playbook => playbook.forcedQuestions);
    expect(forced.filter(id => !bankIds.has(id))).toEqual([]);
  });

  it('should resolve a playbook by key', () => {
    expect(getPlaybook('regression')?.forcedQuestions).toContain('deepen.divergence');
    expect(getPlaybook('nonesuch')).toBeUndefined();
  });
});

describe('matchPlaybooks', () => {
  it.each([
    ['dual leads who share a debt', 'dual-leads'],
    ['the lead is a regressor who remembers the siege', 'regression'],
    ['no harem, one romance only', 'no-harem'],
    ['a litRPG with a visible status window', 'litrpg-system'],
    ['open ended, an ongoing serial', 'open-ended-length'],
    ['an ensemble, a crew of five', 'ensemble'],
    ['a slow burn romance deferred for years', 'slow-burn'],
    ['single POV, tight third throughout', 'single-pov'],
  ])('should match %p to the %p playbook', (text, key) => {
    const { matched, unmatched } = matchPlaybooks([constraint('c', text)]);
    expect(matched.map(match => match.playbook.key)).toEqual([key]);
    expect(unmatched).toEqual([]);
  });

  it.each(['the experience of grief', 'a train station on the coast', 'a level-headed diplomat', 'she experiences the loop as grief'])(
    'should not match %p to any playbook on a substring alone',
    text => {
      expect(matchPlaybooks([constraint('c', text)]).matched).toEqual([]);
    },
  );

  it('should still match a genuine token', () => {
    expect(matchPlaybooks([constraint('c', 'xp grind, levels, a status screen')]).matched.map(match => match.playbook.key)).toEqual(['litrpg-system']);
    expect(matchPlaybooks([constraint('c', 'she is reincarnated as her own rival')]).matched.map(match => match.playbook.key)).toEqual(['regression']);
  });

  it('should match on punctuation and casing the author actually types', () => {
    expect(matchPlaybooks([constraint('c', 'DUAL-LEADS!!')]).matched.map(match => match.playbook.key)).toEqual(['dual-leads']);
  });

  it('should match on the constraint key when the text says nothing recognisable', () => {
    expect(matchPlaybooks([constraint('no-harem', 'she picks him and that is that')]).matched.map(match => match.playbook.key)).toEqual(['no-harem']);
  });

  it('should prefer an explicitly recorded playbook key over text matching', () => {
    const { matched } = matchPlaybooks([constraint('c', 'dual leads', 'shape', 'ensemble')]);
    expect(matched.map(match => match.playbook.key)).toEqual(['ensemble']);
  });

  it('should fall back to text matching when the recorded playbook key is unknown', () => {
    const { matched } = matchPlaybooks([constraint('c', 'dual leads', 'shape', 'nonesuch')]);
    expect(matched.map(match => match.playbook.key)).toEqual(['dual-leads']);
  });

  it('should return an unrecognised constraint as unmatched rather than dropping it', () => {
    const orphan = constraint('epistolary', 'the whole thing is told through salvage manifests');
    const { matched, unmatched } = matchPlaybooks([orphan]);
    expect(matched).toEqual([]);
    expect(unmatched).toEqual([orphan]);
  });

  it('should log one line per unmatched constraint', () => {
    const warn = mock();
    const getLogger = spyOn(Logger, 'getLogger').mockReturnValue({ warn } as never);

    matchPlaybooks([constraint('epistolary', 'told through manifests'), constraint('second-person', 'written in second person')]);

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]?.[1]).toMatchObject({ key: 'epistolary', kind: 'shape' });
    getLogger.mockRestore();
  });

  it('should log nothing when every constraint matches', () => {
    const getLogger = spyOn(Logger, 'getLogger');
    matchPlaybooks([constraint('c', 'dual leads')]);
    expect(getLogger).not.toHaveBeenCalled();
    getLogger.mockRestore();
  });

  it('should report the active keys once even when several constraints hit the same playbook', () => {
    expect(activePlaybookKeys([constraint('a', 'dual leads'), constraint('b', 'two protagonists')])).toEqual(['dual-leads']);
  });

  it('should answer hasPlaybook without consulting the logger', () => {
    expect(hasPlaybook([constraint('c', 'an ongoing serial')], 'open-ended-length')).toBe(true);
    expect(hasPlaybook([constraint('c', 'an ongoing serial')], 'regression')).toBe(false);
  });
});

describe('concept filters', () => {
  it('should reject a dual-leads card that never mentions the second lead', () => {
    const filter = getPlaybook('dual-leads')?.conceptFilter;
    expect(filter?.(card())).toBe(false);
    expect(filter?.(card({ logline: 'two salvagers work one debt' }))).toBe(true);
  });

  it('should reject a no-harem card that advertises a love triangle', () => {
    const filter = getPlaybook('no-harem')?.conceptFilter;
    expect(filter?.(card({ posture: 'a warm love triangle' }))).toBe(false);
    expect(filter?.(card())).toBe(true);
  });

  it('should require a visible number on a litRPG card', () => {
    const filter = getPlaybook('litrpg-system')?.conceptFilter;
    expect(filter?.(card())).toBe(false);
    expect(filter?.(card({ ladder: 'salvage ranks, one tier per wreck' }))).toBe(true);
  });

  it('should reject a single-pov card built on rotating viewpoints', () => {
    const filter = getPlaybook('single-pov')?.conceptFilter;
    expect(filter?.(card({ engine: 'rotating pov across the crew' }))).toBe(false);
    expect(filter?.(card())).toBe(true);
  });

  it('should leave shapes without a hard card rule unfiltered', () => {
    expect(getPlaybook('slow-burn')?.conceptFilter).toBeUndefined();
    expect(getPlaybook('ensemble')?.conceptFilter).toBeUndefined();
  });
});

describe('isOpenEndedLength', () => {
  it.each(['ongoing, three chapters a week', 'open-ended', 'no planned ending', 'a long-running web serial'])('should read %p as open-ended', text => {
    expect(isOpenEndedLength(text)).toBe(true);
  });

  it.each(['sixty chapters, then it ends', 'a finite trilogy'])('should read %p as finite', text => {
    expect(isOpenEndedLength(text)).toBe(false);
  });

  it('should treat an unanswered length as finite', () => {
    expect(isOpenEndedLength(undefined)).toBe(false);
  });
});
