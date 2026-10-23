import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const SPACING = /^(padding|padding-top|margin|gap|border-radius|width|opacity)$/;

interface Expected {
  selector: string;
  values: Record<string, string>;
  source: string;
}

function spacingOf(file: string): Map<string, Record<string, string>> {
  const css = readFileSync(new URL(`../src/features/chapter-workspace/${file}`, import.meta.url), 'utf-8');
  const rules = new Map<string, Record<string, string>>();
  for (const match of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const declarations = Object.fromEntries(
      (match[2] ?? '')
        .split(';')
        .map(line => line.split(':').map(part => part.trim()))
        .filter(([property]) => property && SPACING.test(property)),
    );
    for (const selector of (match[1] ?? '').split(',').map(part => part.trim())) rules.set(selector, { ...rules.get(selector), ...declarations });
  }
  return rules;
}

const PANEL: Expected[] = [
  { selector: '.panel', values: { gap: '14px' }, source: 'design: aside body gap 14px; dialog-body rule (Drawer body gap 14–16)' },
  { selector: '.kindLine', values: { gap: '8px' }, source: 'design: heading row (title + status pill) gap 8px — the kind row pairs the same title and chip' },
  { selector: '.detail', values: { gap: '14px' }, source: 'design: Review tab body gap 14px' },
  { selector: '.head', values: { gap: '8px' }, source: 'design: "AI review · version N" row gap 8px' },
  { selector: '.hint', values: { margin: '0' }, source: 'paragraph margin reset; spacing comes from the column gap' },
  { selector: '.note', values: { margin: '0' }, source: 'paragraph margin reset; spacing comes from the column gap' },
  {
    selector: '.notice',
    values: { gap: '6px', padding: '10px 12px', 'border-radius': 'var(--sh-radius-md)' },
    source: 'design: stale box and clean box: padding 10px 12px, radius 6px (--sh-radius-md), gap 6px',
  },
  { selector: '.section', values: { gap: '8px' }, source: 'design: Findings section gap 8px' },
  {
    selector: '.finding',
    values: { gap: '6px', padding: '10px 12px', 'border-radius': 'var(--sh-radius-lg)' },
    source: 'design: finding card: padding 10px 12px, radius 8px, gap 6px',
  },
  { selector: '.finding[data-settled]', values: { opacity: '0.7' }, source: 'design: closed finding opacity 0.7' },
  { selector: '.findingHead', values: { gap: '6px' }, source: 'design: finding head gap 6px' },
  { selector: '.actions', values: { gap: '6px' }, source: 'design: finding actions gap 6px' },
  { selector: '.undo', values: { padding: '0' }, source: 'design: inline Undo button padding 0' },
  { selector: '.undo:disabled', values: { opacity: '0.5' }, source: 'design: .btn[disabled] opacity .5' },
  { selector: '.form', values: { gap: '6px' }, source: 'design: dismiss form gap 6px' },
  { selector: '.checked', values: { gap: '4px' }, source: 'design: "What was checked" gap 4px' },
  { selector: '.disclaimer', values: { 'padding-top': '4px' }, source: 'design: disclaimer padding-top 4px' },
  { selector: '.running', values: { gap: '8px' }, source: 'gap ladder (8px between controls)' },
  { selector: '.runRow', values: { gap: '8px' }, source: 'design: "Run a new review" row gap 8px' },
];

const DRAWER: Expected[] = [{ selector: '.heldActions', values: { gap: '8px' }, source: 'the old judge ReviewDrawer .reviewActions gap 8px (chapters.module.css on main)' }];

function uncited(file: string, table: Expected[]): string[] {
  return [...spacingOf(file).entries()].filter(([selector, values]) => Object.keys(values).length > 0 && !table.some(e => e.selector === selector)).map(([selector]) => selector);
}

describe('Checks spacing', () => {
  it('should keep every spacing value equal to the value its cited source uses, so drift from the design or today’s screens fails here', () => {
    const panel = spacingOf('ChecksPanel.module.css');
    for (const expected of PANEL) expect({ selector: expected.selector, values: panel.get(expected.selector) }).toEqual({ selector: expected.selector, values: expected.values });
    const drawer = spacingOf('ChecksDrawer.module.css');
    for (const expected of DRAWER) expect({ selector: expected.selector, values: drawer.get(expected.selector) }).toEqual({ selector: expected.selector, values: expected.values });
  });

  it('should not add a spacing value without a cited source', () => {
    expect(uncited('ChecksPanel.module.css', PANEL)).toEqual([]);
    expect(uncited('ChecksDrawer.module.css', DRAWER)).toEqual([]);
  });
});
