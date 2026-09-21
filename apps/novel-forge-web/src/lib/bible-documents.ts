import { type BibleDocListItem, type BibleSection } from './apis/api-types.gen';

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
