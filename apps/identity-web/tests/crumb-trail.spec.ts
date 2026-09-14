import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/components/si/si.module.css', import.meta.url), 'utf-8');

function rule(selector: string): string {
  const match = new RegExp(`(?<!,)\\n${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{`).exec(css);
  return match == null ? '' : css.slice(match.index, css.indexOf('}', match.index));
}

describe('CrumbTrail', () => {
  it('should lay the leaf out before the root so the root is what gives way', () => {
    const trail = rule('.crumbTrail');
    expect(trail).toContain('flex-direction: row-reverse;');
    expect(trail).toContain('flex-wrap: wrap;');
    expect(trail).toContain('justify-content: flex-end;');
    expect(rule('.crumbLeaf')).toContain('order: -1;');
  });

  it('should clip the trail to one line so a wrapped root is hidden', () => {
    const trail = rule('.crumbTrail');
    expect(trail).toContain('min-width: 0;');
    expect(trail).toContain('line-height: var(--sh-text-body-sm--line-height);');
    expect(trail).toContain('height: var(--sh-text-body-sm--line-height);');
    expect(trail).toContain('overflow: hidden;');
  });

  it('should truncate a leaf wider than the whole trail', () => {
    const leaf = rule('.crumbLeaf');
    expect(leaf).toContain('min-width: 0;');
    expect(leaf).toContain('overflow: hidden;');
    expect(leaf).toContain('text-overflow: ellipsis;');
    expect(rule('.crumbRoot,\n.crumbLeaf')).toContain('white-space: nowrap;');
  });
});
