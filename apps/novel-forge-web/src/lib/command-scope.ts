import { type CommandItem } from '@shadow-library/ui';

export interface JumpItem {
  id: string;
  label: string;
  /** Disambiguator shown under the label — a type, a chapter, an owner. */
  caption?: string;
  keywords?: readonly string[];
}

export interface JumpScope {
  /** Plural noun naming the collection — "entities", "canon facts". */
  collection: string;
  /** The directory's filtered, ordered items — the same derivation `ItemPager` pages over. */
  items: readonly JumpItem[];
  /** Names the active filter, so the filtered group reads "Characters" rather than "entities". */
  filterLabel?: string;
  /** The unfiltered collection; whatever the filter excluded lists below it so the filter can be escaped without leaving the palette. */
  allItems?: readonly JumpItem[];
  currentId?: string;
  onSelect: (id: string) => void;
}

export type PaletteState = { kind: 'closed' } | { kind: 'global' } | { kind: 'scoped'; scope: JumpScope };

export interface PaletteView {
  open: boolean;
  /** Changes on every open so the palette remounts — it clears its query only on its own hotkey open. */
  key: string;
  commands: CommandItem[];
  placeholder: string;
  emptyMessage: string;
}

const GLOBAL_PLACEHOLDER = 'Search screens, projects, commands…';
const GLOBAL_EMPTY = 'No results';

export function canJump(scope: JumpScope): boolean {
  return scope.items.length > 0 || (scope.allItems?.length ?? 0) > 0;
}

export function scopedCommands(scope: JumpScope): CommandItem[] {
  const filtered = scope.filterLabel ?? scope.collection;
  const rest = `All ${scope.collection}`;
  const seen = new Set<string>();
  const commands: CommandItem[] = [];
  const push = (item: JumpItem, group: string): void => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    commands.push({
      id: `jump-${item.id}`,
      group,
      label: item.label,
      meta: item.id === scope.currentId ? 'Current' : item.caption,
      keywords: [item.id, ...(item.caption ? [item.caption] : []), ...(item.keywords ?? [])],
      onRun: () => scope.onSelect(item.id),
    });
  };

  for (const item of scope.items) push(item, filtered);
  for (const item of scope.allItems ?? []) push(item, rest);
  return commands;
}

export function scopePlaceholder(scope: JumpScope): string {
  return `Search ${scope.collection}…`;
}

export function scopeEmptyMessage(scope: JumpScope): string {
  return `No matching ${scope.collection}`;
}

export function resolvePaletteView(state: PaletteState, globalCommands: CommandItem[]): PaletteView {
  if (state.kind === 'scoped')
    return {
      open: true,
      key: 'scoped',
      commands: scopedCommands(state.scope),
      placeholder: scopePlaceholder(state.scope),
      emptyMessage: scopeEmptyMessage(state.scope),
    };
  return { open: state.kind === 'global', key: state.kind, commands: globalCommands, placeholder: GLOBAL_PLACEHOLDER, emptyMessage: GLOBAL_EMPTY };
}
