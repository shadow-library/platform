import { type BibleTidyItem, type BibleTidyKind, type BibleTidySelection, type EntityType } from './apis/api-types.gen';

export const TIDY_GROUPS: readonly { kind: BibleTidyKind; label: string; description: string }[] = [
  { kind: 'remove_empty', label: 'Remove empty pages', description: 'Placeholders created with the novel that were never written in.' },
  { kind: 'retitle', label: 'Fix titles', description: 'Pages still titled with their address, given the title their text already uses.' },
  { kind: 'split', label: 'Split into records', description: 'Named things written as sections of one page, each made its own Story Bible record. The page stays as an overview.' },
  { kind: 'move_ai_notes', label: 'Move notes for the AI', description: 'Instructions written for the model, moved out of the story pages into Notes for the AI.' },
];

export interface TidyGroup {
  kind: BibleTidyKind;
  label: string;
  description: string;
  items: BibleTidyItem[];
}

export interface TidyDocumentGroup {
  key: string;
  docTitle: string;
  items: BibleTidyItem[];
}

export function groupTidyItems(items: readonly BibleTidyItem[]): TidyGroup[] {
  return TIDY_GROUPS.map(group => ({ ...group, items: items.filter(item => item.kind === group.kind) })).filter(group => group.items.length > 0);
}

export function groupByDocument(items: readonly BibleTidyItem[]): TidyDocumentGroup[] {
  const groups = new Map<string, TidyDocumentGroup>();
  for (const item of items) {
    const key = `${item.section}/${item.slug}`;
    const group = groups.get(key) ?? { key, docTitle: item.docTitle, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** Splits create new records, so they wait for the author to opt in; everything else starts chosen. */
export function initialTidySelection(items: readonly BibleTidyItem[]): ReadonlySet<string> {
  return new Set(items.filter(item => item.kind !== 'split').map(item => item.id));
}

/** The defaults are taken from the first preview only; a later refetch never adds a chosen item. */
export function seedTidySelection(current: ReadonlySet<string> | null, items: readonly BibleTidyItem[] | undefined): ReadonlySet<string> | null {
  if (current !== null || items === undefined) return current;
  return initialTidySelection(items);
}

export function groupCheckState(items: readonly BibleTidyItem[], included: ReadonlySet<string>): boolean | 'indeterminate' {
  const chosen = items.filter(item => included.has(item.id)).length;
  if (chosen === items.length) return true;
  return chosen === 0 ? false : 'indeterminate';
}

/** Only an entity type the author actually changed travels with the selection. */
export function buildTidySelections(items: readonly BibleTidyItem[], included: ReadonlySet<string>, types: Readonly<Record<string, EntityType>>): BibleTidySelection[] {
  return items
    .filter(item => included.has(item.id))
    .map(item => {
      const type = types[item.id];
      return item.kind === 'split' && type && type !== item.entityType ? { id: item.id, entityType: type } : { id: item.id };
    });
}

export function tidyApplyLabel(count: number): string {
  if (count === 0) return 'Nothing selected';
  return count === 1 ? 'Apply 1 change' : `Apply ${count} changes`;
}
