import { describe, expect, it } from 'bun:test';

import { BIBLE_MANIFEST } from '@modules/bible/bible-manifest';
import {
  type BibleReadinessDimensionName,
  type BibleReadinessInput,
  type BibleReadinessReport,
  DOC_WORD_FLOOR,
  type ReadinessDoc,
  type ReadinessEntity,
  type ReadinessFact,
  scoreBibleReadiness,
} from '@modules/eval/bible-readiness';

const PROSE = `${'word '.repeat(DOC_WORD_FLOOR + 20)}`;

function fullDocs(body = PROSE) {
  return BIBLE_MANIFEST.map(chapter => ({ section: chapter.section, slug: chapter.slug, body }));
}

function score(input: Partial<BibleReadinessInput>): BibleReadinessReport {
  return scoreBibleReadiness({ docs: [], entities: [], facts: [], volumes: [], arcCount: 0, ...input });
}

function records(prefix: string, type: ReadinessEntity['type'], count: number, significance: ReadinessEntity['significance'] = 'minor'): ReadinessEntity[] {
  return Array.from({ length: count }, (_, index) => ({ entityKey: `${prefix}_${index}`, type, significance, body: 'card' }));
}

/** Enough records to clear every manifest floor: 3 characters, 2 factions, 2 locations, 3 power rules, 1 concept. */
function fullEntities(): ReadinessEntity[] {
  return [
    ...records('char', 'character', 3),
    ...records('faction', 'faction', 2),
    ...records('place', 'location', 2),
    ...records('rule', 'power_rule', 3),
    ...records('idea', 'concept', 1),
  ];
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
    const report = score({ docs: [], entities: [], facts: [] });
    expect(report.readyToDraft).toBe(false);
    expect(verdictOf(report, 'coverage')).toBe('empty');
    expect(verdictOf(report, 'records')).toBe('empty');
  });

  it('should call a complete bible ready to draft', () => {
    const facts: ReadinessFact[] = [{ factKey: 'secret', subjects: ['char_0'], revealChapter: 12 }];
    const report = score({ docs: fullDocs(), entities: fullEntities(), facts });
    expect(report.readyToDraft).toBe(true);
    expect(report.blockingGaps).toEqual([]);
    for (const dimension of report.dimensions) expect(dimension.verdict).toBe('strong');
  });

  it('should block a bible whose canon exists only as document prose', () => {
    const report = score({ docs: fullDocs(), entities: [], facts: [] });
    expect(verdictOf(report, 'coverage')).toBe('strong');
    expect(verdictOf(report, 'records')).toBe('empty');
    expect(report.readyToDraft).toBe(false);
    expect(report.blockingGaps.join('\n')).toContain('needs at least 4 power_rule/concept record(s) — found 0');
  });

  it('should name every uncovered role as a coverage gap', () => {
    const report = score({ docs: [{ section: 'project', slug: 'premise', body: PROSE }], entities: [], facts: [] });
    expect(verdictOf(report, 'coverage')).toBe('thin');
    expect(gapsOf(report, 'coverage')).toHaveLength(BIBLE_MANIFEST.length - 1);
    expect(gapsOf(report, 'coverage').join('\n')).toContain('Power system is missing — write power/system-and-limits');
  });

  it('should treat a document with a blank body as absent', () => {
    const report = score({ docs: fullDocs('   '), entities: [], facts: [] });
    expect(verdictOf(report, 'coverage')).toBe('empty');
    expect(report.roles.every(role => !role.covered)).toBe(true);
  });

  it('should flag a role whose documents together fall below the word floor', () => {
    const docs = [...fullDocs().filter(doc => doc.section !== 'power'), { section: 'power', slug: 'tiers', body: 'only a few words here' }];
    const report = score({ docs, entities: fullEntities(), facts: [] });
    expect(verdictOf(report, 'substance')).toBe('thin');
    expect(gapsOf(report, 'substance').join('\n')).toContain('Power system is thin at 5 words across power/tiers (floor 250)');
    expect(report.readyToDraft).toBe(true);
  });

  it('should read a role split across several short documents as one', () => {
    const half = 'word '.repeat(DOC_WORD_FLOOR / 2 + 5);
    const docs = [
      ...fullDocs().filter(doc => doc.section !== 'power'),
      { section: 'power', slug: 'rules-and-limits', body: half },
      { section: 'power', slug: 'progression-ladder', body: half },
    ];
    const report = score({ docs, entities: fullEntities(), facts: [] });
    expect(verdictOf(report, 'substance')).toBe('strong');
  });

  it('should not hold a short document outside every role to the word floor', () => {
    const docs = [...fullDocs(), { section: 'lore', slug: 'stub', body: 'only a few words here' }];
    const report = score({ docs, entities: fullEntities(), facts: [] });
    expect(verdictOf(report, 'substance')).toBe('strong');
  });

  it('should hold a premise to a pitch-length floor rather than the chapter floor', () => {
    const docs = [...fullDocs().filter(doc => doc.slug !== 'premise'), { section: 'project', slug: 'premise', body: 'word '.repeat(120) }];
    const report = score({ docs, entities: fullEntities(), facts: [] });
    expect(verdictOf(report, 'substance')).toBe('strong');
  });

  it('should flag placeholder text left in an otherwise long document', () => {
    const docs = [...fullDocs(), { section: 'lore', slug: 'draft', body: `${PROSE} TODO finish this` }];
    const report = score({ docs, entities: fullEntities(), facts: [] });
    expect(gapsOf(report, 'substance').join('\n')).toContain('lore/draft still carries placeholder text');
  });

  it('should not let substance or reveal gaps block drafting', () => {
    const docs = [...fullDocs(), { section: 'lore', slug: 'stub', body: 'TODO' }];
    const facts: ReadinessFact[] = [
      { factKey: 'a', subjects: ['char_0'], revealChapter: 4 },
      { factKey: 'b', subjects: ['char_1'], revealChapter: null },
    ];
    const report = score({ docs, entities: fullEntities(), facts });
    expect(verdictOf(report, 'substance')).toBe('thin');
    expect(verdictOf(report, 'reveal')).toBe('thin');
    expect(report.readyToDraft).toBe(true);
    expect(report.blockingGaps).toEqual([]);
  });

  it('should report a canon fact naming a subject that is not an entity', () => {
    const facts: ReadinessFact[] = [{ factKey: 'betrayal', subjects: ['ghost_who_walks'], revealChapter: 3 }];
    const report = score({ docs: fullDocs(), entities: fullEntities(), facts });
    expect(verdictOf(report, 'integrity')).toBe('empty');
    expect(gapsOf(report, 'integrity').join('\n')).toContain("names subject 'ghost_who_walks', which is not an entity");
  });

  it('should report a major entity with no card body', () => {
    const entities: ReadinessEntity[] = [...fullEntities(), { entityKey: 'lead', type: 'character', significance: 'major', body: '' }];
    const report = score({ docs: fullDocs(), entities, facts: [] });
    expect(gapsOf(report, 'integrity').join('\n')).toContain("major entity 'lead' has no card body");
  });

  it('should report an absent reveal schedule when no canon facts exist', () => {
    const report = score({ docs: fullDocs(), entities: fullEntities(), facts: [] });
    expect(verdictOf(report, 'reveal')).toBe('empty');
    expect(gapsOf(report, 'reveal').join('\n')).toContain('no canon facts exist');
  });

  it('should count facts without a reveal chapter as an unplanned reveal order', () => {
    const facts: ReadinessFact[] = [
      { factKey: 'a', subjects: ['char_0'], revealChapter: 4 },
      { factKey: 'b', subjects: ['char_1'], revealChapter: null },
    ];
    const report = score({ docs: fullDocs(), entities: fullEntities(), facts });
    expect(verdictOf(report, 'reveal')).toBe('thin');
    expect(gapsOf(report, 'reveal').join('\n')).toContain('1 of 2 canon fact(s) have no revealChapter');
  });

  it('should count entities of a declared type from anywhere in the bible toward a chapter floor', () => {
    const entities: ReadinessEntity[] = Array.from({ length: 4 }, (_, index) => ({ entityKey: `c_${index}`, type: 'concept', significance: 'minor', body: 'card' }));
    const report = score({ docs: fullDocs(), entities, facts: [] });
    const powerGap = gapsOf(report, 'records').join('\n');
    expect(powerGap).not.toContain('power/system-and-limits');
    expect(powerGap).toContain('project/cast needs at least 3 character record(s) — found 0');
  });

  describe('roles', () => {
    const substance = (count: number) => 'word '.repeat(count);

    it('should call an imported bible ready when its substance lives under other names and in records', () => {
      const docs: ReadinessDoc[] = [
        { section: 'project', slug: 'premise', body: PROSE },
        { section: 'world', slug: 'setting-overview', body: PROSE },
        { section: 'plot', slug: 'escalation-map', body: PROSE },
        { section: 'power', slug: 'rules-and-limits', body: substance(120) },
        { section: 'power', slug: 'progression-ladder', body: substance(120) },
        { section: 'power', slug: 'classes-and-abilities', body: substance(120) },
        { section: 'world', slug: 'factions', body: substance(200) },
        { section: 'world', slug: 'geography-and-travel', body: substance(200) },
      ];
      const entities = [
        ...records('lead', 'character', 1, 'major'),
        ...records('support', 'character', 20),
        ...records('faction', 'faction', 6),
        ...records('place', 'location', 12),
        ...records('rule', 'power_rule', 4),
      ];
      const volumes = Array.from({ length: 12 }, (_, index) => ({ volumeKey: `v${index + 1}`, objective: `objective ${index + 1}` }));
      const facts: ReadinessFact[] = [
        { factKey: 'scheduled', subjects: ['lead_0'], revealChapter: 9 },
        { factKey: 'unscheduled', subjects: ['lead_0'], revealChapter: null },
      ];

      const report = score({ docs, entities, facts, volumes, arcCount: 72 });

      expect(report.readyToDraft).toBe(true);
      expect(report.blockingGaps).toEqual([]);
      expect(verdictOf(report, 'coverage')).toBe('strong');
      const coveredBy = Object.fromEntries(report.roles.map(role => [role.stage, role.coveredBy]));
      expect(coveredBy['power']).toEqual(['power/rules-and-limits', 'power/progression-ladder', 'power/classes-and-abilities']);
      expect(coveredBy['factionsAndLocations']).toEqual(['world/factions', 'world/geography-and-travel', '6 faction records and 12 location records']);
      expect(coveredBy['characters']).toEqual(['21 character records']);
      expect(coveredBy['volumes']).toEqual(['12 volumes with objectives and 72 arcs']);
    });

    it('should match a role by document title when the slug says nothing', () => {
      const docs: ReadinessDoc[] = [{ section: 'power', slug: 'doc-7', title: 'Ranks and Their Costs', body: PROSE }];
      const power = score({ docs }).roles.find(role => role.stage === 'power');
      expect(power?.coveredBy).toEqual(['power/doc-7']);
    });

    it('should not credit a document to a role outside its sections', () => {
      const docs: ReadinessDoc[] = [{ section: 'plot', slug: 'faction-war', body: PROSE }];
      const factions = score({ docs }).roles.find(role => role.stage === 'factionsAndLocations');
      expect(factions?.covered).toBe(false);
    });

    it('should not match a keyword that only begins a longer word', () => {
      const docs: ReadinessDoc[] = [{ section: 'story_state', slug: 'volumetric-notes', body: PROSE }];
      expect(score({ docs }).roles.find(role => role.stage === 'volumes')?.covered).toBe(false);
    });

    it('should not let a cast of only minor characters stand in for the cast document', () => {
      const cast = score({ entities: records('extra', 'character', 5) }).roles.find(role => role.stage === 'characters');
      expect(cast?.covered).toBe(false);
    });

    it('should accept a cast whose significance was never classified', () => {
      const cast = score({ entities: records('person', 'character', 3, null) }).roles.find(role => role.stage === 'characters');
      expect(cast?.covered).toBe(true);
    });

    it('should not count volumes without objectives as a volume plan', () => {
      const volumes = [
        { volumeKey: 'v1', objective: '  ' },
        { volumeKey: 'v2', objective: null },
      ];
      expect(score({ volumes, arcCount: 4 }).roles.find(role => role.stage === 'volumes')?.covered).toBe(false);
    });

    it('should require a faction among the records that cover factions and locations', () => {
      const factions = score({ entities: records('place', 'location', 6) }).roles.find(role => role.stage === 'factionsAndLocations');
      expect(factions?.covered).toBe(false);
    });

    it('should let a thin geography document cover world but not factions and locations', () => {
      const docs: ReadinessDoc[] = [{ section: 'world', slug: 'geography', body: PROSE }];
      const report = score({ docs });
      expect(report.roles.find(role => role.stage === 'world')?.covered).toBe(true);
      expect(report.roles.find(role => role.stage === 'factionsAndLocations')?.covered).toBe(false);
    });

    it('should never let two roles share a keyword', () => {
      const owners = new Map<string, string>();
      const duplicates: string[] = [];
      for (const chapter of BIBLE_MANIFEST) {
        for (const keyword of chapter.role.keywords) {
          const owner = owners.get(keyword);
          if (owner && owner !== chapter.stage) duplicates.push(`'${keyword}' claimed by both ${owner} and ${chapter.stage}`);
          owners.set(keyword, chapter.stage);
        }
      }
      expect(duplicates).toEqual([]);
    });

    it('should report an empty project as not ready with every role named', () => {
      const report = score({});
      expect(report.readyToDraft).toBe(false);
      expect(report.roles.map(role => role.covered)).toEqual(BIBLE_MANIFEST.map(() => false));
      const gaps = report.blockingGaps.join('\n');
      for (const chapter of BIBLE_MANIFEST) expect(gaps).toContain(`${chapter.role.label} is missing — write ${chapter.section}/${chapter.slug}`);
      expect(gaps).toContain('at least 3 character records, not all of them minor');
      expect(gaps).toContain('volume records with objectives');
    });
  });
});
