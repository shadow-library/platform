import { type BibleDocListItem, type BibleReadinessRoleResponse, type BibleSection } from './apis/api-types.gen';

export const BIBLE_DOC_SECTION_LABEL: Record<BibleSection, string> = {
  project: 'Core',
  world: 'World',
  power: 'Power',
  plot: 'Plot',
  story_state: 'Where things stand',
  ai: 'Notes for the AI',
  lore: 'Lore',
};

export function emptyPlaceholdersLabel(count: number): string {
  return count === 1 ? '1 empty placeholder page' : `${count} empty placeholder pages`;
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

export interface BibleHealthInput {
  records: number;
  guides: number;
  secrets: number;
  emptyPages: number;
  roles: readonly Pick<BibleReadinessRoleResponse, 'label' | 'covered'>[] | undefined;
}

export interface BibleTopicCoverage {
  covered: number;
  total: number;
  missing: string[];
}

export interface BibleHealth {
  entries: number;
  records: number;
  guides: number;
  secrets: number;
  emptyPages: number;
  topics?: BibleTopicCoverage;
}

export function bibleHealth({ records, guides, secrets, emptyPages, roles }: BibleHealthInput): BibleHealth {
  const health: BibleHealth = { entries: records + guides, records, guides, secrets, emptyPages };
  if (!roles || roles.length === 0) return health;
  const missing = roles.filter(role => !role.covered).map(role => role.label);
  return { ...health, topics: { covered: roles.length - missing.length, total: roles.length, missing } };
}

export function topicCoverageLabel(topics: BibleTopicCoverage): string {
  if (topics.missing.length === 0) return 'Every topic covered';
  return `Missing: ${topics.missing.join(', ')}`;
}
