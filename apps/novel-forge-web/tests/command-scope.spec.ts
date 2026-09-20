import { describe, expect, it } from 'bun:test';

import { canJump, type JumpScope, resolvePaletteView, scopedCommands } from '../src/lib/command-scope';

const characters = [
  { id: 'amara', label: 'Amara Vale', caption: 'Character' },
  { id: 'boone', label: 'Boone', caption: 'Character' },
];
const places = [{ id: 'harrow', label: 'Harrow Bridge', caption: 'Location' }];

function scope(overrides: Partial<JumpScope> = {}): JumpScope {
  return { collection: 'entities', items: characters, onSelect: () => undefined, ...overrides };
}

const globalCommands = [{ id: 'go-projects', group: 'Go to', label: 'All projects', onRun: () => undefined }];

describe('canJump', () => {
  it('should offer the jump when the filtered list has items', () => {
    expect(canJump(scope())).toBe(true);
  });

  it('should offer the jump when only the unfiltered list has items, so a filter matching nothing is escapable', () => {
    expect(canJump(scope({ items: [], allItems: places }))).toBe(true);
  });

  it('should withhold the jump from an empty collection', () => {
    expect(canJump(scope({ items: [] }))).toBe(false);
  });
});

describe('scopedCommands', () => {
  it('should group the filtered items under the filter name', () => {
    const commands = scopedCommands(scope({ filterLabel: 'Characters' }));
    expect(commands.map(command => command.group)).toEqual(['Characters', 'Characters']);
    expect(commands.map(command => command.id)).toEqual(['jump-amara', 'jump-boone']);
  });

  it('should group under the collection noun when no filter is active', () => {
    expect(scopedCommands(scope()).map(command => command.group)).toEqual(['entities', 'entities']);
  });

  it('should list what the filter excluded in a trailing group, so the filter can be escaped from inside the palette', () => {
    const commands = scopedCommands(scope({ filterLabel: 'Characters', allItems: [...characters, ...places] }));
    expect(commands.map(command => [command.group, command.id])).toEqual([
      ['Characters', 'jump-amara'],
      ['Characters', 'jump-boone'],
      ['All entities', 'jump-harrow'],
    ]);
  });

  it('should never list an item twice when the unfiltered list repeats the filtered one', () => {
    const commands = scopedCommands(scope({ allItems: characters }));
    expect(commands.map(command => command.id)).toEqual(['jump-amara', 'jump-boone']);
  });

  it('should mark the item already on screen instead of hiding it', () => {
    const commands = scopedCommands(scope({ currentId: 'boone' }));
    expect(commands.map(command => command.meta)).toEqual(['Character', 'Current']);
  });

  it('should match on the id and caption as well as the label, since identifiers are what an author types', () => {
    const [command] = scopedCommands(scope({ items: [{ id: 'families_survived_me', label: 'families_survived_me', caption: 'Chapter 12', keywords: ['canon'] }] }));
    expect(command?.keywords).toEqual(['families_survived_me', 'Chapter 12', 'canon']);
  });

  it('should select the item it was built from', () => {
    const picked: string[] = [];
    const commands = scopedCommands(scope({ onSelect: id => picked.push(id) }));
    commands[1]?.onRun();
    expect(picked).toEqual(['boone']);
  });
});

describe('resolvePaletteView', () => {
  it('should keep the global palette closed with its own commands', () => {
    expect(resolvePaletteView({ kind: 'closed' }, globalCommands)).toEqual({
      open: false,
      key: 'closed',
      commands: globalCommands,
      placeholder: 'Search screens, projects, commands…',
      emptyMessage: 'No results',
    });
  });

  it('should open the global palette unchanged by the scope capability', () => {
    const view = resolvePaletteView({ kind: 'global' }, globalCommands);
    expect(view.open).toBe(true);
    expect(view.commands).toBe(globalCommands);
    expect(view.placeholder).toBe('Search screens, projects, commands…');
  });

  it('should open the scoped palette over the collection alone', () => {
    const view = resolvePaletteView({ kind: 'scoped', scope: scope() }, globalCommands);
    expect(view.open).toBe(true);
    expect(view.placeholder).toBe('Search entities…');
    expect(view.emptyMessage).toBe('No matching entities');
    expect(view.commands.map(command => command.id)).toEqual(['jump-amara', 'jump-boone']);
  });

  it('should remount the palette between a global and a scoped open so no query leaks across', () => {
    expect(resolvePaletteView({ kind: 'global' }, globalCommands).key).not.toBe(resolvePaletteView({ kind: 'scoped', scope: scope() }, globalCommands).key);
  });
});
