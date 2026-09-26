import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const SPACING = /^(padding|padding-top|margin|margin-left|margin-bottom|gap|border-radius|width|height|max-width|max-height)$/;

interface Expected {
  selector: string;
  values: Record<string, string>;
  source: string;
}

function spacingOf(path: string): Map<string, Record<string, string>> {
  const css = readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');
  const end = css.search(/@media/);
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

function check(path: string, table: Expected[]): void {
  const rules = spacingOf(path);
  for (const expected of table) expect({ selector: expected.selector, values: rules.get(expected.selector) }).toEqual({ selector: expected.selector, values: expected.values });
  const uncited = [...rules.entries()].filter(([selector, values]) => Object.keys(values).length > 0 && !table.some(e => e.selector === selector)).map(([selector]) => selector);
  expect(uncited).toEqual([]);
}

// Line numbers are in scratch-pad/novel-forge/design/Chapter.dc.html; "reference" is scratch-pad/novel-forge/ui-spacing-reference.md.
const PASSAGE: Expected[] = [
  {
    selector: '.card',
    values: { gap: '8px', margin: '0 0 18px', padding: '12px', 'border-radius': 'var(--sh-radius-lg)' },
    source: 'canvas l.94 ask box, l.104 suggestion, l.114 stale: margin 0 0 18px, padding 12px, radius 8px, gap 8px',
  },
  { selector: '.quote', values: { margin: '0', padding: '0' }, source: 'blockquote reset; spacing comes from the card gap' },
  { selector: '.chips', values: { gap: '6px' }, source: 'canvas l.96 quick requests gap 6px' },
  { selector: '.actions', values: { gap: '8px' }, source: 'canvas l.99 and l.109 action rows gap 8px' },
  { selector: '.hint', values: { 'margin-left': 'auto' }, source: 'canvas l.99 “Only this passage changes” margin-left auto' },
  { selector: '.leaks', values: { margin: '0', padding: '0 0 0 1.6em' }, source: 'list indent of .nf-md ul (styles.css), the reader’s own lists' },
  { selector: '.staleRow', values: { gap: '10px' }, source: 'canvas l.114 stale row gap 10px' },
  { selector: '.segment:not(:last-child)', values: { 'margin-bottom': '1.1em' }, source: '.nf-md p margin 0 0 1.1em (styles.css), restored between split Markdown blocks' },
  {
    selector: '.selectionNote',
    values: { 'max-width': '360px', padding: '10px 12px', 'border-radius': 'var(--sh-radius-md)' },
    source: 'ChecksPanel .notice padding 10px 12px, radius md; reference Drawer sm 360 as the narrowest reading column',
  },
];

const DETAILS: Expected[] = [
  { selector: '.panel', values: { 'border-radius': '0' }, source: 'canvas l.140 aside is border-left only; reference SidePanel “next to a transcript: border-left only”' },
  { selector: '.tab', values: { gap: '14px' }, source: 'canvas l.144 aside body gap 14px' },
  { selector: '.section', values: { gap: '6px' }, source: 'canvas l.146, l.151–153, l.187, l.197 sections gap 6px' },
  { selector: '.people', values: { gap: '8px' }, source: 'canvas l.147 Who appears gap 8px' },
  { selector: '.person', values: { gap: '10px' }, source: 'canvas l.148 avatar row gap 10px' },
  { selector: '.avatar', values: { width: '32px', height: '32px', 'border-radius': 'var(--sh-radius-full)' }, source: 'canvas l.148 avatar 32×32, radius 9999px' },
  { selector: '.hint', values: { padding: '10px 12px', 'border-radius': 'var(--sh-radius-lg)' }, source: 'canvas l.154 suggestions note padding 10px 12px, radius 8px' },
  { selector: '.keptBack', values: { gap: '6px', padding: '10px 12px', 'border-radius': 'var(--sh-radius-lg)' }, source: 'canvas l.190 Kept from the writer box' },
  {
    selector: '.message',
    values: { gap: '6px', padding: '10px 12px', 'border-radius': 'var(--sh-radius-lg)' },
    source: 'canvas l.164 finding card: the Review tab’s card, reused for each message sent',
  },
  { selector: '.messageBody', values: { margin: '0' }, source: 'pre reset; spacing comes from the card gap' },
  { selector: '.version', values: { gap: '4px', padding: '10px 12px', 'border-radius': 'var(--sh-radius-lg)' }, source: 'canvas l.207 version card' },
  { selector: '.versionHead', values: { gap: '8px' }, source: 'canvas l.208 version head gap 8px' },
  { selector: '.badge', values: { 'margin-left': 'auto' }, source: 'canvas l.208 “Current” margin-left auto' },
  { selector: '.versionActions', values: { gap: '8px' }, source: 'canvas l.210 version actions gap 8px' },
  { selector: '.compare', values: { gap: '14px' }, source: 'reference rule 9: Dialog body flex column gap 14–16' },
  { selector: '.compareBar', values: { gap: '8px' }, source: 'reference rule 6: 8px between controls' },
  { selector: '.diff', values: { gap: '12px' }, source: 'reference rule 6: 12px inside cards' },
  { selector: '.paragraph', values: { margin: '0' }, source: 'paragraph reset; spacing comes from the diff gap' },
  { selector: '.paragraph ins', values: { 'border-radius': 'var(--sh-radius-sm)' }, source: 'canvas l.91 rewritten passage highlight radius 3px → radius-sm' },
  { selector: '.paragraph del', values: { 'border-radius': 'var(--sh-radius-sm)' }, source: 'canvas l.91 rewritten passage highlight radius 3px → radius-sm' },
];

function declarationsOf(css: string, selector: string): Record<string, string> | undefined {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|[}\\s])${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) return undefined;
  return Object.fromEntries(
    (match[1] ?? '')
      .split(';')
      .map(line => line.split(':').map(part => part.trim()))
      .filter(([property]) => property),
  );
}

function chaptersCss(): { top: string; phone: string } {
  const css = readFileSync(new URL('../src/routes/novels/$novelId/chapters.module.css', import.meta.url), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');
  const phoneAt = css.indexOf('@media (max-width: 960px)');
  const phoneEnd = css.indexOf('\n}\n', phoneAt);
  return { top: phoneAt === -1 ? css : css.slice(0, phoneAt) + css.slice(phoneEnd + 3), phone: phoneAt === -1 ? '' : css.slice(phoneAt, phoneEnd + 3) };
}

// "main" is routes/novels/$novelId/chapters.module.css at 2469d4ea, before the details panel split the editor body.
const REUSED: [string, Record<string, string>][] = [
  ['.editorScreen', { position: 'absolute', inset: '0', display: 'flex', 'flex-direction': 'column', background: 'var(--sh-surface-app)', overflow: 'hidden' }],
  ['.editorHead', { height: '60px', 'flex-shrink': '0', display: 'flex', 'align-items': 'center', gap: '14px', padding: '0 20px 0 14px' }],
  ['.scrollFill', { position: 'absolute', inset: '0' }],
  ['.editorInner', { 'padding-block': '16px 120px' }],
  ['.reader', { 'padding-block': '64px 120px', 'font-size': '19px', 'line-height': '1.85', 'font-family': 'var(--sh-font-sans)' }],
  ['.finalNote', { margin: '26px 0 0', 'font-size': 'var(--sh-text-body-sm)', 'line-height': 'var(--sh-text-body-sm--line-height)', color: 'var(--sh-text-secondary)' }],
];

describe('Chapter workspace layout', () => {
  it('should keep the body’s own sizing from main and move only its positioning to the new reading column', () => {
    const { top } = chaptersCss();
    expect(declarationsOf(top, '.body')).toEqual({ flex: '1', 'min-height': '0', display: 'flex' });
    expect(declarationsOf(top, '.main')).toEqual({ flex: '1', 'min-width': '0', position: 'relative' });
  });

  it('should stack the reading column over the details panel at the 960px side-panel breakpoint', () => {
    const { phone } = chaptersCss();
    expect(declarationsOf(phone, '.body')).toEqual({ 'flex-direction': 'column' });
    expect(declarationsOf(phone, '.main')).toEqual({ 'min-height': '0' });
  });

  it('should leave the reused editor and reader rules exactly as main has them', () => {
    const { top } = chaptersCss();
    for (const [selector, values] of REUSED) expect({ selector, values: declarationsOf(top, selector) }).toEqual({ selector, values });
  });
});

describe('Chapter workspace spacing', () => {
  it('should keep the passage cards on the canvas values, with nothing uncited', () => {
    check('features/chapter-workspace/PassageAsk.module.css', PASSAGE);
  });

  it('should keep the details panel on the canvas values, with nothing uncited', () => {
    check('features/chapter-workspace/ChapterDetails.module.css', DETAILS);
  });
});
