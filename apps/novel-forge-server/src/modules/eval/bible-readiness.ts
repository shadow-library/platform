import { BIBLE_MANIFEST, type BibleChapterSpec, type BibleStage, chapterForStage } from '@modules/bible/bible-manifest';

import { type Bible, type Knowledge } from '@server/database';

import { countWords } from './deterministic-metrics';

export const BIBLE_READINESS_VERDICTS = ['strong', 'thin', 'empty'] as const;
export type BibleReadinessVerdict = (typeof BIBLE_READINESS_VERDICTS)[number];

export const BIBLE_READINESS_DIMENSIONS = ['coverage', 'records', 'substance', 'integrity', 'reveal'] as const;
export type BibleReadinessDimensionName = (typeof BIBLE_READINESS_DIMENSIONS)[number];

export interface ReadinessDoc {
  section: string;
  slug: string;
  /** Read alongside the slug when matching a document to a role; imported bibles often carry the meaning only here. */
  title?: string | null;
  body: string | null;
}

export interface ReadinessEntity {
  entityKey: string;
  type: Knowledge.EntityType;
  significance?: Knowledge.EntitySignificance | null;
  body?: string | null;
}

export interface ReadinessFact {
  factKey: string;
  subjects?: string[] | null;
  revealChapter?: number | null;
}

export interface ReadinessVolume {
  volumeKey: string;
  objective?: string | null;
}

export interface BibleReadinessInput {
  docs: readonly ReadinessDoc[];
  entities: readonly ReadinessEntity[];
  facts: readonly ReadinessFact[];
  volumes: readonly ReadinessVolume[];
  arcCount: number;
}

export interface BibleReadinessDimension {
  dimension: BibleReadinessDimensionName;
  verdict: BibleReadinessVerdict;
  satisfied: number;
  total: number;
  gaps: string[];
}

export interface BibleReadinessRole {
  stage: BibleStage;
  label: string;
  /** Where the builder writes this role; any other address or record set that carries the substance covers it too. */
  address: string;
  covered: boolean;
  coveredBy: string[];
}

export interface BibleReadinessReport {
  dimensions: BibleReadinessDimension[];
  roles: BibleReadinessRole[];
  /** Coverage and records must both be strong: chapters cannot be drafted from canon that is absent or invisible. */
  readyToDraft: boolean;
  blockingGaps: string[];
}

/** Below this a role's documents read as a stub rather than something an author could write a scene from. */
export const DOC_WORD_FLOOR = 250;

/** A premise is a pitch, and graduation writes it short on purpose. */
const ROLE_WORD_FLOOR: Partial<Record<BibleStage, number>> = { foundation: 100 };

const PLACEHOLDER_PATTERN = /\b(?:tbd|todo|fixme)\b|\[(?:placeholder|fill in|tbd)\]|lorem ipsum/i;

const BLOCKING_DIMENSIONS: readonly BibleReadinessDimensionName[] = ['coverage', 'records'];

interface RecordCoverage {
  hint: (chapter: BibleChapterSpec) => string;
  coveredBy: (input: BibleReadinessInput, chapter: BibleChapterSpec) => string | null;
}

const RECORD_COVERAGE: Partial<Record<BibleStage, RecordCoverage>> = {
  factionsAndLocations: {
    hint: chapter => `at least ${chapter.minEntities} faction/location records, one of them a faction`,
    coveredBy: (input, chapter) => {
      const factions = input.entities.filter(entity => entity.type === 'faction').length;
      const locations = input.entities.filter(entity => entity.type === 'location').length;
      if (factions === 0 || factions + locations < chapter.minEntities) return null;
      return `${plural(factions, 'faction record')} and ${plural(locations, 'location record')}`;
    },
  },
  characters: {
    hint: chapter => `at least ${chapter.minEntities} character records, not all of them minor`,
    coveredBy: (input, chapter) => {
      const characters = input.entities.filter(entity => entity.type === 'character');
      if (characters.length < chapter.minEntities || characters.every(entity => entity.significance === 'minor')) return null;
      return plural(characters.length, 'character record');
    },
  },
  volumes: {
    hint: () => 'volume records with objectives',
    coveredBy: input => {
      const planned = input.volumes.filter(volume => hasText(volume.objective)).length;
      if (planned === 0) return null;
      return `${plural(planned, 'volume')} with objectives and ${plural(input.arcCount, 'arc')}`;
    },
  },
};

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function hasText(text: string | null | undefined): boolean {
  return (text ?? '').trim() !== '';
}

function address(doc: { section: string; slug: string }): string {
  return `${doc.section}/${doc.slug}`;
}

function matchesKeyword(word: string, keyword: string): boolean {
  return word === keyword || word === `${keyword}s` || word === `${keyword}es` || (keyword.endsWith('y') && word === `${keyword.slice(0, -1)}ies`);
}

function servesRole(doc: ReadinessDoc, chapter: BibleChapterSpec): boolean {
  if (doc.section === chapter.section && doc.slug === chapter.slug) return true;
  if (!chapter.role.sections.includes(doc.section as Bible.Section)) return false;
  const words = `${doc.slug} ${doc.title ?? ''}`.toLowerCase().split(/[^a-z0-9]+/);
  return words.some(word => chapter.role.keywords.some(keyword => matchesKeyword(word, keyword)));
}

function roleDocs(docs: readonly ReadinessDoc[], chapter: BibleChapterSpec): ReadinessDoc[] {
  return docs.filter(doc => hasText(doc.body) && servesRole(doc, chapter));
}

function verdictFor(satisfied: number, total: number): BibleReadinessVerdict {
  if (total === 0 || satisfied === total) return 'strong';
  return satisfied > 0 ? 'thin' : 'empty';
}

function dimension(name: BibleReadinessDimensionName, satisfied: number, total: number, gaps: string[]): BibleReadinessDimension {
  return { dimension: name, verdict: verdictFor(satisfied, total), satisfied, total, gaps };
}

function roles(input: BibleReadinessInput): BibleReadinessRole[] {
  return BIBLE_MANIFEST.map(chapter => {
    const recordCoverage = RECORD_COVERAGE[chapter.stage]?.coveredBy(input, chapter);
    const coveredBy = [...roleDocs(input.docs, chapter).map(address), ...(recordCoverage ? [recordCoverage] : [])];
    return { stage: chapter.stage, label: chapter.role.label, address: address(chapter), covered: coveredBy.length > 0, coveredBy };
  });
}

function coverage(covered: readonly BibleReadinessRole[]): BibleReadinessDimension {
  const gaps = covered
    .filter(role => !role.covered)
    .map(role => {
      const chapter = chapterForStage(role.stage);
      const recordCoverage = RECORD_COVERAGE[chapter.stage];
      const alternatives = [`another ${chapter.role.sections.join('/')} document on it`, ...(recordCoverage ? [recordCoverage.hint(chapter)] : [])].join(', or ');
      return `${role.label} is missing — write ${role.address} (or ${alternatives}): ${chapter.purpose}`;
    });
  return dimension('coverage', covered.length - gaps.length, covered.length, gaps);
}

function records(entities: readonly ReadinessEntity[]): BibleReadinessDimension {
  const chapters = BIBLE_MANIFEST.filter(chapter => chapter.materializes.length > 0);
  const gaps: string[] = [];
  let satisfied = 0;
  for (const chapter of chapters) {
    const declared = new Set<string>(chapter.materializes);
    const count = entities.filter(entity => declared.has(entity.type)).length;
    if (count >= chapter.minEntities) satisfied += 1;
    else gaps.push(`${chapter.section}/${chapter.slug} needs at least ${chapter.minEntities} ${chapter.materializes.join('/')} record(s) — found ${count}`);
  }
  return dimension('records', satisfied, chapters.length, gaps);
}

/**
 * Judged per role rather than per document, so an imported bible that splits a role across several short pages is
 * read as a whole; documents outside every role are only checked for placeholder text, never for length.
 */
function substance(docs: readonly ReadinessDoc[]): BibleReadinessDimension {
  const gaps: string[] = [];
  let total = 0;
  let satisfied = 0;
  const judged = new Set<ReadinessDoc>();

  for (const chapter of BIBLE_MANIFEST) {
    const written = roleDocs(docs, chapter);
    if (written.length === 0) continue;
    written.forEach(doc => judged.add(doc));
    total += 1;
    const floor = ROLE_WORD_FLOOR[chapter.stage] ?? DOC_WORD_FLOOR;
    const words = written.reduce((sum, doc) => sum + countWords(doc.body ?? ''), 0);
    const placeholders = written.filter(doc => PLACEHOLDER_PATTERN.test(doc.body ?? ''));
    if (words < floor) gaps.push(`${chapter.role.label} is thin at ${words} words across ${written.map(address).join(', ')} (floor ${floor})`);
    else if (placeholders.length > 0) gaps.push(...placeholders.map(doc => `${address(doc)} still carries placeholder text`));
    else satisfied += 1;
  }

  for (const doc of docs.filter(candidate => hasText(candidate.body) && !judged.has(candidate))) {
    total += 1;
    if (PLACEHOLDER_PATTERN.test(doc.body ?? '')) gaps.push(`${address(doc)} still carries placeholder text`);
    else satisfied += 1;
  }

  return dimension('substance', satisfied, total, gaps);
}

function integrity(entities: readonly ReadinessEntity[], facts: readonly ReadinessFact[]): BibleReadinessDimension {
  const keys = new Set(entities.map(entity => entity.entityKey));
  const gaps: string[] = [];
  let total = 0;
  let satisfied = 0;

  for (const fact of facts) {
    for (const subject of fact.subjects ?? []) {
      total += 1;
      if (keys.has(subject)) satisfied += 1;
      else gaps.push(`canon fact '${fact.factKey}' names subject '${subject}', which is not an entity in this bible`);
    }
  }

  for (const entity of entities.filter(candidate => candidate.significance === 'major')) {
    total += 1;
    if ((entity.body ?? '').trim() !== '') satisfied += 1;
    else gaps.push(`major entity '${entity.entityKey}' has no card body a chapter author could write from`);
  }

  return dimension('integrity', satisfied, total, gaps);
}

function reveal(facts: readonly ReadinessFact[]): BibleReadinessDimension {
  if (facts.length === 0) return dimension('reveal', 0, 1, ['no canon facts exist, so the serial has no reveal schedule to pace its mysteries against']);
  const scheduled = facts.filter(fact => typeof fact.revealChapter === 'number' && fact.revealChapter > 0).length;
  const gaps = scheduled === facts.length ? [] : [`${facts.length - scheduled} of ${facts.length} canon fact(s) have no revealChapter, so their reveal order is unplanned`];
  return dimension('reveal', scheduled, facts.length, gaps);
}

export function scoreBibleReadiness(input: BibleReadinessInput): BibleReadinessReport {
  const covered = roles(input);
  const dimensions = [coverage(covered), records(input.entities), substance(input.docs), integrity(input.entities, input.facts), reveal(input.facts)];

  const blocking = dimensions.filter(entry => BLOCKING_DIMENSIONS.includes(entry.dimension) && entry.verdict !== 'strong');
  return { dimensions, roles: covered, readyToDraft: blocking.length === 0, blockingGaps: blocking.flatMap(entry => entry.gaps) };
}
