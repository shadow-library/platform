import { type BibleDocListItem, type BibleRoleResponse, type BibleSection } from './apis/api-types.gen';

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

/** The overview names the documents that cover each topic by `section/slug`; record summaries in `coveredBy` match no address and drop out. */
export function topicsByDocument(roles: readonly BibleRoleResponse[] | undefined): Map<string, string[]> {
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

export function unresolvedReferencesLabel(count: number): string {
  return count === 1 ? '1 reference to a missing entry' : `${count} references to missing entries`;
}

export interface BibleHealthInput {
  records: number;
  guides: number;
  secrets: number;
  emptyPages: number;
}

export interface BibleHealth {
  entries: number;
  records: number;
  guides: number;
  secrets: number;
  emptyPages: number;
}

export function bibleHealth({ records, guides, secrets, emptyPages }: BibleHealthInput): BibleHealth {
  return { entries: records + guides, records, guides, secrets, emptyPages };
}
