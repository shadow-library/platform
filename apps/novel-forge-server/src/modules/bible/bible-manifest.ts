import { type Bible, type Knowledge } from '@server/database';

export type BibleStage = 'foundation' | 'world' | 'power' | 'factionsAndLocations' | 'characters' | 'plot' | 'volumes';

export interface BibleChapterSpec {
  stage: BibleStage;
  section: Bible.Section;
  slug: string;
  purpose: string;
  /** Entity types whose canon must exist as `entities` rows, not only as prose in the body. */
  materializes: readonly Knowledge.EntityType[];
  /** Coverage floor enforced on the stage's output and re-checked by the readiness score. */
  minEntities: number;
  /** Judged inside the body by the auditor, so one chapter can carry several concerns without one document per concern. */
  requiredTopics: readonly string[];
}

export const BIBLE_STAGE_ORDER: readonly BibleStage[] = ['foundation', 'world', 'power', 'factionsAndLocations', 'characters', 'plot', 'volumes'];

export const BIBLE_MANIFEST: readonly BibleChapterSpec[] = [
  {
    stage: 'foundation',
    section: 'project',
    slug: 'premise',
    purpose: 'the full premise: hook, stakes, protagonist drive, the reader promise, and the tone the serial is allowed to swing between',
    materializes: [],
    minEntities: 0,
    requiredTopics: ['hook', 'stakes', 'protagonist drive', 'reader promise', 'pacing and tone'],
  },
  {
    stage: 'world',
    section: 'world',
    slug: 'setting-overview',
    purpose: 'where and when the story lives, the rules of normal life, and the geopolitical shape that makes the plot possible',
    materializes: ['location', 'concept'],
    minEntities: 3,
    requiredTopics: ['era and place', 'rules of normal life', 'geopolitical shape'],
  },
  {
    stage: 'power',
    section: 'power',
    slug: 'system-and-limits',
    purpose: 'the visible progression ladder readers anticipate, plus what power costs, what it cannot do, and what breaking its rules means',
    materializes: ['power_rule', 'concept'],
    minEntities: 4,
    requiredTopics: ['progression ladder', 'costs and limits', 'consequences of breaking the rules'],
  },
  {
    stage: 'factionsAndLocations',
    section: 'world',
    slug: 'factions-and-locations',
    purpose: 'the powers that be, what each wants, why they collide, and the places those collisions happen in',
    materializes: ['faction', 'location'],
    minEntities: 4,
    requiredTopics: ['faction goals', 'faction conflicts', 'locations that matter to the plot'],
  },
  {
    stage: 'characters',
    section: 'project',
    slug: 'cast',
    purpose: 'the cast: who carries the story, what each wants, and the relationships that generate conflict',
    materializes: ['character'],
    minEntities: 3,
    requiredTopics: ['protagonist', 'antagonist', 'supporting cast', 'relationships'],
  },
  {
    stage: 'plot',
    section: 'plot',
    slug: 'escalation-map',
    purpose: 'how stakes grow volume over volume, from the opening conflict to the endgame the whole serial steers toward',
    materializes: [],
    minEntities: 0,
    requiredTopics: ['escalation per volume', 'endgame vision'],
  },
  {
    stage: 'volumes',
    section: 'story_state',
    slug: 'volume-plan',
    purpose: 'the volume-by-volume plan: ordinals, objectives, the conflict each raises and the payoff each owes',
    materializes: [],
    minEntities: 0,
    requiredTopics: ['volume objectives', 'per-volume payoff'],
  },
];

/**
 * Where the builder wrote each stage before the manifest existed. The slugs never overlapped the
 * auditor's, so a built bible read as entirely missing; migration 0040 rewrites these in place.
 */
export const LEGACY_CHAPTER_SLUGS: readonly { section: string; slug: string; stage: BibleStage }[] = [
  { section: 'project', slug: 'foundation', stage: 'foundation' },
  { section: 'world', slug: 'world-power', stage: 'world' },
  { section: 'world', slug: 'factions-locations', stage: 'factionsAndLocations' },
  { section: 'ai', slug: 'characters', stage: 'characters' },
  { section: 'plot', slug: 'plot', stage: 'plot' },
  { section: 'story_state', slug: 'volumes', stage: 'volumes' },
];

const BY_STAGE = new Map(BIBLE_MANIFEST.map(chapter => [chapter.stage, chapter]));
const BY_ADDRESS = new Map(BIBLE_MANIFEST.map(chapter => [`${chapter.section}/${chapter.slug}`, chapter]));

export function chapterForStage(stage: BibleStage): BibleChapterSpec {
  const chapter = BY_STAGE.get(stage);
  if (!chapter) throw new Error(`[bible-manifest] no chapter declared for stage '${stage}'`);
  return chapter;
}

export function chapterAt(section: string, slug: string): BibleChapterSpec | undefined {
  return BY_ADDRESS.get(`${section}/${slug}`);
}

export function entityTypesForSection(section: string): Knowledge.EntityType[] {
  const types = BIBLE_MANIFEST.filter(chapter => chapter.section === section).flatMap(chapter => [...chapter.materializes]);
  return [...new Set(types)];
}

export function isEntityBearingSection(section: string): boolean {
  return entityTypesForSection(section).length > 0;
}

/**
 * What an author-named document owes in records. A declared chapter answers for itself. An undeclared slug
 * inherits its section's types only where every chapter in that section materializes — `power` and `world`
 * are about records, so `power/supers-and-rifts` owes them, while `project` mixes the record-bearing `cast`
 * with the prose-only `premise` and cannot speak for a slug it never declared.
 */
export function requiredEntityTypesForSlug(section: string, slug: string): readonly Knowledge.EntityType[] {
  const chapter = chapterAt(section, slug);
  if (chapter) return chapter.materializes;

  const siblings = BIBLE_MANIFEST.filter(candidate => candidate.section === section);
  if (siblings.length === 0 || siblings.some(candidate => candidate.materializes.length === 0)) return [];
  return entityTypesForSection(section);
}

export function renderManifest(): string {
  return BIBLE_MANIFEST.map(chapter => {
    const entities = chapter.materializes.length > 0 ? ` — must materialize at least ${chapter.minEntities} entities of type: ${chapter.materializes.join(', ')}` : '';
    return `${chapter.section}/${chapter.slug} — ${chapter.purpose}${entities}\n  topics it must cover: ${chapter.requiredTopics.join('; ')}`;
  }).join('\n');
}
