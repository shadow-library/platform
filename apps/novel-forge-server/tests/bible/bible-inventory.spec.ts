import { describe, expect, it } from 'bun:test';

import { countEntitiesByType, firstLine, type InventoryEntity, renderDocInventory, renderEntityInventory } from '@modules/bible/bible-inventory';

const entities: InventoryEntity[] = [
  { entityKey: 'kael', name: 'Kael', type: 'character' },
  { entityKey: 'mira', name: 'Mira', type: 'character' },
  { entityKey: 'the_choir', name: 'The Choir', type: 'faction' },
];

describe('firstLine', () => {
  it('should skip a leading markdown heading and return the first prose line', () => {
    expect(firstLine('# Supers and Rifts\n\nAether entered Earth through the Rifts.')).toBe('Aether entered Earth through the Rifts.');
  });

  it('should report an empty body rather than returning a blank string', () => {
    expect(firstLine('')).toBe('(empty)');
    expect(firstLine(null)).toBe('(empty)');
    expect(firstLine('\n\n   \n')).toBe('(empty)');
  });

  it('should report a heading-only body as empty', () => {
    expect(firstLine('# Title\n## Subtitle')).toBe('(empty)');
  });

  it('should truncate a long line so the inventory stays a summary', () => {
    const line = firstLine('x'.repeat(400));
    expect(line).toHaveLength(201);
    expect(line.endsWith('…')).toBe(true);
  });
});

describe('renderDocInventory', () => {
  it('should report none when the project has no documents', () => {
    expect(renderDocInventory([])).toBe('none');
  });

  it('should carry the revision, a word count and the opening line for each document', () => {
    const rendered = renderDocInventory([{ section: 'power', slug: 'system-and-limits', revision: 3, body: '# Ranks\n\nF through S, in order.' }]);
    expect(rendered).toBe('power/system-and-limits (revision 3, 7 words) — F through S, in order.');
  });
});

describe('renderEntityInventory', () => {
  it('should say plainly that no records exist, so the audit cannot read silence as coverage', () => {
    expect(renderEntityInventory([])).toBe('none — no entity records exist for this project');
  });

  it('should group records by type with a count and the keys', () => {
    const rendered = renderEntityInventory(entities);
    expect(rendered).toContain('character (2): kael "Kael", mira "Mira"');
    expect(rendered).toContain('faction (1): the_choir "The Choir"');
  });
});

describe('countEntitiesByType', () => {
  it('should count each type present and omit types with no records', () => {
    const counts = countEntitiesByType(entities);
    expect(counts.get('character')).toBe(2);
    expect(counts.get('faction')).toBe(1);
    expect(counts.has('power_rule')).toBe(false);
  });
});
