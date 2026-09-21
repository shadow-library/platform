import { type BibleDocListItem, type BibleReadinessRoleResponse, type BibleSection } from './apis/api-types.gen';
import { formatWordCount } from './field-card';

export const BIBLE_DOC_SECTION_ORDER: readonly BibleSection[] = ['project', 'world', 'power', 'plot', 'story_state', 'ai', 'lore'];

export const BIBLE_DOC_SECTION_LABEL: Record<BibleSection, string> = {
  project: 'Core',
  world: 'World',
  power: 'Power',
  plot: 'Plot',
  story_state: 'Where things stand',
  ai: 'Notes for the AI',
  lore: 'Lore',
};

export interface BibleDocSectionGroup {
  section: BibleSection;
  label: string;
  filled: BibleDocListItem[];
  empty: BibleDocListItem[];
}

/** The fixed section order, real pages first within each section; sections with no documents are left out. */
export function groupBibleDocs(docs: readonly BibleDocListItem[]): BibleDocSectionGroup[] {
  const bySection = new Map<BibleSection, BibleDocListItem[]>();
  for (const doc of docs) {
    const bucket = bySection.get(doc.section);
    if (bucket) bucket.push(doc);
    else bySection.set(doc.section, [doc]);
  }
  return BIBLE_DOC_SECTION_ORDER.filter(section => bySection.has(section)).map(section => {
    const items = bySection.get(section) ?? [];
    return { section, label: BIBLE_DOC_SECTION_LABEL[section], filled: items.filter(doc => !doc.isEmpty), empty: items.filter(doc => doc.isEmpty) };
  });
}

export function emptyPagesLabel(count: number): string {
  return count === 1 ? '1 empty page' : `${count} empty pages`;
}

/** The same control collapses what it revealed, so opening a section's empty pages is never a one-way trip. */
export function emptyToggleLabel(count: number, revealed: boolean): string {
  return revealed ? 'Hide empty pages' : emptyPagesLabel(count);
}

export function docAddress(doc: Pick<BibleDocListItem, 'section' | 'slug'>): string {
  return `${doc.section}/${doc.slug}`;
}

/** Readiness names the documents that cover each topic by `section/slug`; record summaries in `coveredBy` match no address and drop out. */
export function topicsByDocument(roles: readonly BibleReadinessRoleResponse[] | undefined): Map<string, string[]> {
  const topics = new Map<string, string[]>();
  for (const role of roles ?? []) {
    for (const address of role.coveredBy) {
      const labels = topics.get(address);
      if (labels) labels.push(role.label);
      else topics.set(address, [role.label]);
    }
  }
  return topics;
}

export function docLengthLabel(doc: Pick<BibleDocListItem, 'isEmpty' | 'wordCount'>): string {
  return doc.isEmpty ? 'Empty' : formatWordCount(doc.wordCount);
}

export interface BibleHealthInput {
  docs: readonly Pick<BibleDocListItem, 'isEmpty'>[];
  entities: number;
  facts: number;
  roles: readonly Pick<BibleReadinessRoleResponse, 'label' | 'covered'>[] | undefined;
}

export interface BibleTopicCoverage {
  covered: number;
  total: number;
  missing: string[];
}

export interface BibleHealth {
  pages: number;
  emptyPages: number;
  entities: number;
  facts: number;
  topics?: BibleTopicCoverage;
}

export function bibleHealth({ docs, entities, facts, roles }: BibleHealthInput): BibleHealth {
  const emptyPages = docs.filter(doc => doc.isEmpty).length;
  const health: BibleHealth = { pages: docs.length - emptyPages, emptyPages, entities, facts };
  if (!roles || roles.length === 0) return health;
  const missing = roles.filter(role => !role.covered).map(role => role.label);
  return { ...health, topics: { covered: roles.length - missing.length, total: roles.length, missing } };
}

export function topicCoverageLabel(topics: BibleTopicCoverage): string {
  if (topics.missing.length === 0) return 'Every topic covered';
  return `Missing: ${topics.missing.join(', ')}`;
}
