import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/components/Layout/AppShell.module.css', import.meta.url), 'utf-8');

function rule(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  return start < 0 ? '' : css.slice(start, css.indexOf('}', start));
}

describe('AppShell search trigger', () => {
  it('should truncate its label to one line instead of wrapping out of the top bar', () => {
    const label = rule('.searchLabel');
    expect(label).toContain('min-width: 0;');
    expect(label).toContain('white-space: nowrap;');
    expect(label).toContain('overflow: hidden;');
    expect(label).toContain('text-overflow: ellipsis;');
  });

  it('should let the trigger shrink with the search column while the icon and shortcut keep their size', () => {
    expect(rule('.search')).toContain('min-width: min(220px, 100%);');
    expect(rule('.search > :not(.searchLabel)')).toContain('flex-shrink: 0;');
  });
});
