import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const SPACING = /^(padding|padding-top|margin|margin-top|margin-left|gap|border-radius|width|max-width|flex-basis|grid-template-columns|container-type|min-height|column-gap)$/;

interface Expected {
  selector: string;
  values: Record<string, string>;
  source: string;
}

function spacingOf(path: string): Map<string, Record<string, string>> {
  const css = readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');
  const end = css.search(/@media|@container/);
  const scoped = end === -1 ? css : css.slice(0, end);
  const rules = new Map<string, Record<string, string>>();
  for (const match of scoped.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
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

function checkListed(path: string, table: Expected[]): void {
  const rules = spacingOf(path);
  for (const expected of table) expect({ selector: expected.selector, values: rules.get(expected.selector) }).toEqual({ selector: expected.selector, values: expected.values });
}

function checkAll(path: string, table: Expected[]): void {
  checkListed(path, table);
  const uncited = [...spacingOf(path).entries()]
    .filter(([selector, values]) => Object.keys(values).length > 0 && !table.some(e => e.selector === selector))
    .map(([selector]) => selector);
  expect(uncited).toEqual([]);
}

// "today" in a `source` is the chapters list's value before the volume layout.
const VOLUMES: Expected[] = [
  { selector: '.volumes', values: { gap: '16px', 'margin-top': '12px' }, source: 'design: main gap 16px between volumes; today .listBody margin-top 12px under the filters' },
  {
    selector: '.section',
    values: { 'container-type': 'inline-size', 'border-radius': 'var(--sh-radius-lg)' },
    source: 'design: radius 8px; today .listBody is the rows’ container',
  },
  {
    selector: '.head',
    values: { gap: '14px', width: '100%', padding: '14px 16px' },
    source: 'design: gap 14px, width 100%, padding 14px 16px',
  },
  { selector: '.chevron', values: { width: '12px' }, source: 'design: chevron width 12px' },
  { selector: '.headMain', values: { gap: '2px' }, source: 'design: title→goal gap 2px' },
  { selector: '.headLine', values: { gap: '10px' }, source: 'design: eyebrow, title and state chip gap 10px' },
  { selector: '.note', values: { margin: '0', padding: '16px' }, source: 'design: padding 16px; paragraph margin reset' },
  { selector: '.pager', values: { gap: '6px', padding: '10px 16px' }, source: 'design: gap 6px, padding 10px 16px' },
  { selector: '.pages', values: { gap: '6px', 'margin-left': 'auto' }, source: 'design: margin-left auto, gap 6px' },
  { selector: '.writing', values: { gap: '10px', padding: '10px 16px' }, source: 'design: gap 10px, padding 10px 16px' },
  { selector: '.writingAction', values: { 'margin-left': 'auto' }, source: 'design: margin-left auto' },
];

const TOOLBAR: Expected[] = [
  {
    selector: '.toolbar',
    values: { gap: '12px', margin: '26px 0 4px', 'max-width': '100%' },
    source: 'design: gap 12px; today .filterWrap margin 26px 0 4px and max-width 100%, kept for the reused filter row',
  },
  { selector: '.count', values: { 'margin-left': '4px' }, source: 'today .filterCount margin-left 4px' },
  { selector: '.field', values: { gap: '12px' }, source: 'design: label and select sit in the toolbar’s 12px gap' },
  { selector: '.select', values: { width: 'auto' }, source: 'design: the select is as wide as its options, not the row' },
  { selector: '.search', values: { width: '280px', 'max-width': '100%' }, source: 'Story Bible .search width 280px, max-width 100% (the search it copies)' },
  { selector: '.jump', values: { gap: '6px', 'margin-left': 'auto' }, source: 'design: margin-left auto, gap 6px' },
  { selector: '.jumpField', values: { width: '150px' }, source: 'design: width 150px' },
  { selector: '.status', values: { margin: '12px 0 0' }, source: 'design: gap 16px = the toolbar’s 4px margin-bottom + 12px' },
];

const LIST: Expected[] = [
  { selector: '.listHead', values: { gap: '16px' }, source: 'today, unchanged; design: gap 16px' },
  { selector: '.listActions', values: { gap: '8px' }, source: 'design: header actions gap 8px' },
  { selector: '.listBody', values: { 'container-type': 'inline-size', margin: '12px 0 0', padding: '0', 'border-radius': 'var(--sh-radius-lg)' }, source: 'today, unchanged' },
  { selector: '.listBodyNested', values: { margin: '0', 'border-radius': '0' }, source: 'rows inside a volume card: card-interior rule, no card inside a card' },
  {
    selector: '.listBody .row',
    values: { 'grid-template-columns': '3ch minmax(0, 1fr) auto 96px 16px', 'column-gap': '16px', width: '100%', 'min-height': '56px', padding: '10px 16px', 'border-radius': '0' },
    source: 'today, unchanged; design: gap 16px, min-height 56px, padding 10px 16px agree',
  },
  {
    selector: '.rowMeta',
    values: { 'grid-template-columns': '40px 88px 150px', 'column-gap': '12px' },
    source: 'today 40px 88px, status widened to the design’s REVIEW column 150px for “Changed since approved”',
  },
  { selector: '.hitMain', values: { gap: '4px' }, source: 'search hit title→snippet: gap ladder (4 title→subtitle)' },
];

describe('Chapters list spacing', () => {
  it('should keep every volume and toolbar value equal to its cited source, and none without one', () => {
    checkAll('features/chapter-list/VolumeSection.module.css', VOLUMES);
    checkAll('features/chapter-list/ChapterToolbar.module.css', TOOLBAR);
  });

  it('should keep today’s list values and the design values it adds', () => {
    checkListed('features/chapters/chapters.module.css', LIST);
  });
});
