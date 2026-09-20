import { BIBLE_MANIFEST } from '@modules/bible/bible-manifest';

import { type Knowledge } from '@server/database';

import { countWords } from './deterministic-metrics';

export const BIBLE_READINESS_VERDICTS = ['strong', 'thin', 'empty'] as const;
export type BibleReadinessVerdict = (typeof BIBLE_READINESS_VERDICTS)[number];

export const BIBLE_READINESS_DIMENSIONS = ['coverage', 'records', 'substance', 'integrity', 'reveal'] as const;
export type BibleReadinessDimensionName = (typeof BIBLE_READINESS_DIMENSIONS)[number];

export interface ReadinessDoc {
  section: string;
  slug: string;
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

export interface BibleReadinessInput {
  docs: readonly ReadinessDoc[];
  entities: readonly ReadinessEntity[];
  facts: readonly ReadinessFact[];
}

export interface BibleReadinessDimension {
  dimension: BibleReadinessDimensionName;
  verdict: BibleReadinessVerdict;
  satisfied: number;
  total: number;
  gaps: string[];
}

export interface BibleReadinessReport {
  dimensions: BibleReadinessDimension[];
  /** Coverage and records must both be strong: chapters cannot be drafted from canon that is absent or invisible. */
  readyToDraft: boolean;
  blockingGaps: string[];
}

/** Below this a chapter reads as a stub rather than something an author could write a scene from. */
export const DOC_WORD_FLOOR = 250;

const PLACEHOLDER_PATTERN = /\b(?:tbd|todo|fixme)\b|\[(?:placeholder|fill in|tbd)\]|lorem ipsum/i;

const BLOCKING_DIMENSIONS: readonly BibleReadinessDimensionName[] = ['coverage', 'records'];

function verdictFor(satisfied: number, total: number): BibleReadinessVerdict {
  if (total === 0 || satisfied === total) return 'strong';
  return satisfied > 0 ? 'thin' : 'empty';
}

function dimension(name: BibleReadinessDimensionName, satisfied: number, total: number, gaps: string[]): BibleReadinessDimension {
  return { dimension: name, verdict: verdictFor(satisfied, total), satisfied, total, gaps };
}

function coverage(docs: readonly ReadinessDoc[]): BibleReadinessDimension {
  const gaps: string[] = [];
  let satisfied = 0;
  for (const chapter of BIBLE_MANIFEST) {
    const doc = docs.find(candidate => candidate.section === chapter.section && candidate.slug === chapter.slug);
    if (doc && (doc.body ?? '').trim() !== '') satisfied += 1;
    else gaps.push(`${chapter.section}/${chapter.slug} is missing — ${chapter.purpose}`);
  }
  return dimension('coverage', satisfied, BIBLE_MANIFEST.length, gaps);
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

function substance(docs: readonly ReadinessDoc[]): BibleReadinessDimension {
  const written = docs.filter(doc => (doc.body ?? '').trim() !== '');
  const gaps: string[] = [];
  let satisfied = 0;
  for (const doc of written) {
    const body = doc.body ?? '';
    const words = countWords(body);
    if (words < DOC_WORD_FLOOR) gaps.push(`${doc.section}/${doc.slug} is thin at ${words} words (floor ${DOC_WORD_FLOOR})`);
    else if (PLACEHOLDER_PATTERN.test(body)) gaps.push(`${doc.section}/${doc.slug} still carries placeholder text`);
    else satisfied += 1;
  }
  return dimension('substance', satisfied, written.length, gaps);
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
  const dimensions = [coverage(input.docs), records(input.entities), substance(input.docs), integrity(input.entities, input.facts), reveal(input.facts)];

  const blocking = dimensions.filter(entry => BLOCKING_DIMENSIONS.includes(entry.dimension) && entry.verdict !== 'strong');
  return { dimensions, readyToDraft: blocking.length === 0, blockingGaps: blocking.flatMap(entry => entry.gaps) };
}
