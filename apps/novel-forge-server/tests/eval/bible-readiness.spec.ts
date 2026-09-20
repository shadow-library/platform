import { describe, expect, it } from 'bun:test';

import { BIBLE_MANIFEST } from '@modules/bible/bible-manifest';
import {
  type BibleReadinessDimensionName,
  type BibleReadinessReport,
  DOC_WORD_FLOOR,
  type ReadinessEntity,
  type ReadinessFact,
  scoreBibleReadiness,
} from '@modules/eval/bible-readiness';

const PROSE = `${'word '.repeat(DOC_WORD_FLOOR + 20)}`;

function fullDocs(body = PROSE) {
  return BIBLE_MANIFEST.map(chapter => ({ section: chapter.section, slug: chapter.slug, body }));
}

/** Enough records to clear every manifest floor: 3 characters, 2 factions, 2 locations, 3 power rules, 1 concept. */
function fullEntities(): ReadinessEntity[] {
  const make = (prefix: string, type: ReadinessEntity['type'], count: number): ReadinessEntity[] =>
    Array.from({ length: count }, (_, index) => ({ entityKey: `${prefix}_${index}`, type, significance: 'minor' as const, body: 'card' }));
  return [...make('char', 'character', 3), ...make('faction', 'faction', 2), ...make('place', 'location', 2), ...make('rule', 'power_rule', 3), ...make('idea', 'concept', 1)];
}

function verdictOf(report: BibleReadinessReport, dimension: BibleReadinessDimensionName): string {
  const entry = report.dimensions.find(candidate => candidate.dimension === dimension);
  if (!entry) throw new Error(`missing dimension ${dimension}`);
  return entry.verdict;
}

function gapsOf(report: BibleReadinessReport, dimension: BibleReadinessDimensionName): string[] {
  return report.dimensions.find(candidate => candidate.dimension === dimension)?.gaps ?? [];
}

describe('scoreBibleReadiness', () => {
  it('should refuse to call an empty bible ready to draft', () => {
    const report = scoreBibleReadiness({ docs: [], entities: [], facts: [] });
    expect(report.readyToDraft).toBe(false);
    expect(verdictOf(report, 'coverage')).toBe('empty');
    expect(verdictOf(report, 'records')).toBe('empty');
  });

  it('should call a complete bible ready to draft', () => {
    const facts: ReadinessFact[] = [{ factKey: 'secret', subjects: ['char_0'], revealChapter: 12 }];
    const report = scoreBibleReadiness({ docs: fullDocs(), entities: fullEntities(), facts });
    expect(report.readyToDraft).toBe(true);
    expect(report.blockingGaps).toEqual([]);
    for (const dimension of report.dimensions) expect(dimension.verdict).toBe('strong');
  });

  it('should block a bible whose canon exists only as document prose', () => {
    const report = scoreBibleReadiness({ docs: fullDocs(), entities: [], facts: [] });
    expect(verdictOf(report, 'coverage')).toBe('strong');
    expect(verdictOf(report, 'records')).toBe('empty');
    expect(report.readyToDraft).toBe(false);
    expect(report.blockingGaps.join('\n')).toContain('needs at least 4 power_rule/concept record(s) — found 0');
  });

  it('should name every missing manifest chapter as a coverage gap', () => {
    const report = scoreBibleReadiness({ docs: [{ section: 'project', slug: 'premise', body: PROSE }], entities: fullEntities(), facts: [] });
    expect(verdictOf(report, 'coverage')).toBe('thin');
    expect(gapsOf(report, 'coverage')).toHaveLength(BIBLE_MANIFEST.length - 1);
    expect(gapsOf(report, 'coverage').join('\n')).toContain('power/system-and-limits is missing');
  });

  it('should treat a document with a blank body as absent', () => {
    const report = scoreBibleReadiness({ docs: fullDocs('   '), entities: fullEntities(), facts: [] });
    expect(verdictOf(report, 'coverage')).toBe('empty');
  });

  it('should flag a document thinner than the word floor', () => {
    const docs = [...fullDocs(), { section: 'lore', slug: 'stub', body: 'only a few words here' }];
    const report = scoreBibleReadiness({ docs, entities: fullEntities(), facts: [] });
    expect(verdictOf(report, 'substance')).toBe('thin');
    expect(gapsOf(report, 'substance').join('\n')).toContain('lore/stub is thin at 5 words');
  });

  it('should flag placeholder text left in an otherwise long document', () => {
    const docs = [...fullDocs(), { section: 'lore', slug: 'draft', body: `${PROSE} TODO finish this` }];
    const report = scoreBibleReadiness({ docs, entities: fullEntities(), facts: [] });
    expect(gapsOf(report, 'substance').join('\n')).toContain('lore/draft still carries placeholder text');
  });

  it('should not let substance or reveal gaps block drafting', () => {
    const docs = [...fullDocs(), { section: 'lore', slug: 'stub', body: 'thin' }];
    const report = scoreBibleReadiness({ docs, entities: fullEntities(), facts: [] });
    expect(verdictOf(report, 'substance')).toBe('thin');
    expect(verdictOf(report, 'reveal')).toBe('empty');
    expect(report.readyToDraft).toBe(true);
  });

  it('should report a canon fact naming a subject that is not an entity', () => {
    const facts: ReadinessFact[] = [{ factKey: 'betrayal', subjects: ['ghost_who_walks'], revealChapter: 3 }];
    const report = scoreBibleReadiness({ docs: fullDocs(), entities: fullEntities(), facts });
    expect(verdictOf(report, 'integrity')).toBe('empty');
    expect(gapsOf(report, 'integrity').join('\n')).toContain("names subject 'ghost_who_walks', which is not an entity");
  });

  it('should report a major entity with no card body', () => {
    const entities: ReadinessEntity[] = [...fullEntities(), { entityKey: 'lead', type: 'character', significance: 'major', body: '' }];
    const report = scoreBibleReadiness({ docs: fullDocs(), entities, facts: [] });
    expect(gapsOf(report, 'integrity').join('\n')).toContain("major entity 'lead' has no card body");
  });

  it('should report an absent reveal schedule when no canon facts exist', () => {
    const report = scoreBibleReadiness({ docs: fullDocs(), entities: fullEntities(), facts: [] });
    expect(verdictOf(report, 'reveal')).toBe('empty');
    expect(gapsOf(report, 'reveal').join('\n')).toContain('no canon facts exist');
  });

  it('should count facts without a reveal chapter as an unplanned reveal order', () => {
    const facts: ReadinessFact[] = [
      { factKey: 'a', subjects: ['char_0'], revealChapter: 4 },
      { factKey: 'b', subjects: ['char_1'], revealChapter: null },
    ];
    const report = scoreBibleReadiness({ docs: fullDocs(), entities: fullEntities(), facts });
    expect(verdictOf(report, 'reveal')).toBe('thin');
    expect(gapsOf(report, 'reveal').join('\n')).toContain('1 of 2 canon fact(s) have no revealChapter');
  });

  it('should count entities of a declared type from anywhere in the bible toward a chapter floor', () => {
    const entities: ReadinessEntity[] = Array.from({ length: 4 }, (_, index) => ({ entityKey: `c_${index}`, type: 'concept', significance: 'minor', body: 'card' }));
    const report = scoreBibleReadiness({ docs: fullDocs(), entities, facts: [] });
    const powerGap = gapsOf(report, 'records').join('\n');
    expect(powerGap).not.toContain('power/system-and-limits');
    expect(powerGap).toContain('project/cast needs at least 3 character record(s) — found 0');
  });
});
