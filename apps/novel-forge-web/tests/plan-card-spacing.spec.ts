import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const SPACING = /^(padding|padding-top|margin|margin-top|margin-left|gap|border-radius|width|max-width|flex-basis|grid-template-columns|container-type)$/;

interface Expected {
  selector: string;
  values: Record<string, string>;
  source: string;
}

function spacingOf(file: string, media?: string): Map<string, Record<string, string>> {
  const css = readFileSync(new URL(`../src/features/plan-card/${file}`, import.meta.url), 'utf-8');
  const start = media ? css.indexOf(media) : 0;
  const scoped = media ? css.slice(css.indexOf('{', start) + 1) : css.slice(0, css.search(/@media|@container/) === -1 ? undefined : css.search(/@media|@container/));
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

// "turnCard" is the chat proposal card in routes/novels/$novelId/chat.module.css, whose frame the plan card keeps.
const CARD: Expected[] = [
  {
    selector: '.card',
    values: { width: '100%', 'max-width': '720px', 'margin-top': '0', 'border-radius': 'var(--sh-radius-lg)' },
    source:
      'turnCard: width 100%, max-width 720px, radius lg (chat.module.css); design: radius 8px; margin-top 0 — the transcript gap 20 is the design spacing, and the card has no avatar to indent under',
  },
  { selector: '.head', values: { gap: '8px', padding: '10px 12px' }, source: 'turnCard .turnCardHead gap 8, padding 10px 12px; the design agrees' },
  { selector: '.length', values: { gap: '6px', 'margin-left': 'auto' }, source: 'design: length control gap 6px, margin-left auto' },
  { selector: '.alert', values: { padding: '10px 12px' }, source: 'turnCard .turnCardNote/.turnCardWarning padding 10px 12px' },
  { selector: '.body', values: { gap: '12px', margin: '0', padding: '14px' }, source: 'design: plan body padding 14px, gap 12px; margin reset for fieldset' },
  { selector: '.recap', values: { gap: '4px' }, source: 'gap ladder (4 title→subtitle)' },
  { selector: '.field', values: { gap: '4px' }, source: 'design: label→field gap 4px' },
  { selector: '.group', values: { gap: '6px' }, source: 'design: scenes group gap 6px (milestones, content mode alike)' },
  { selector: '.scenes', values: { gap: '6px', margin: '0', padding: '0' }, source: 'design: scenes group gap 6px; list margin and padding reset' },
  { selector: '.sceneBlock', values: { gap: '4px' }, source: 'design: gap 4px: a scene’s details sit under its row as a field under its label' },
  { selector: '.scene', values: { gap: '8px' }, source: 'design: scene row gap 8px' },
  { selector: '.sceneNumber', values: { width: '20px' }, source: 'design: scene number width 20px' },
  { selector: '.scenePov', values: { width: '96px' }, source: 'design: scene POV select width 96px' },
  { selector: '.hint', values: { margin: '0' }, source: 'paragraph margin reset; spacing comes from the column gap' },
  {
    selector: '.pooling',
    values: { gap: '8px', padding: '10px 12px', 'border-radius': 'var(--sh-radius-lg)' },
    source: 'design: pooling note gap 8px, padding 10px 12px, radius 8px',
  },
  { selector: '.poolingActions', values: { gap: '8px' }, source: 'design: pooling actions gap 8px' },
  {
    selector: '.diagnostics',
    values: { gap: '6px', margin: '0', padding: '10px 12px', 'border-radius': 'var(--sh-radius-md)' },
    source: 'ChecksPanel.module.css .notice: gap 6px, padding 10px 12px, radius md (today’s diagnostic box)',
  },
  { selector: '.moreSummary', values: { width: 'fit-content' }, source: 'the disclosure is as wide as its words, like the design “Add a scene” (align-self flex-start)' },
  { selector: '.moreBody', values: { gap: '12px', 'padding-top': '8px' }, source: 'design: field gap 12px; gap ladder (8 between controls) under the summary' },
  { selector: '.chips', values: { gap: '6px' }, source: 'design: chip rows gap 6px; gap ladder (6 chips)' },
  { selector: '.chip', values: { 'max-width': '100%' }, source: 'a chip never overflows its row at 390 (no horizontal scroll)' },
  { selector: '.modes', values: { 'grid-template-columns': 'repeat(2, minmax(0, 1fr))', gap: '8px' }, source: 'design: two columns, gap 8px' },
  {
    selector: '.mode',
    values: { gap: '2px', padding: '10px 12px', 'border-radius': 'var(--sh-radius-lg)' },
    source: 'design: mode radio gap 2px, padding 10px 12px, radius 8px',
  },
  { selector: '.modeNote', values: { padding: '8px 10px', 'border-radius': 'var(--sh-radius-md)' }, source: 'design: unrestricted note padding 8px 10px, radius 6px' },
  {
    selector: '.writer',
    values: { gap: '8px', padding: '12px 14px', 'border-radius': 'var(--sh-radius-lg)' },
    source: 'design: writer box gap 8px, padding 12px 14px, radius 8px',
  },
  { selector: '.writerHead', values: { gap: '8px' }, source: 'design: writer box head gap 8px' },
  { selector: '.kept', values: { padding: '10px 12px', 'border-radius': 'var(--sh-radius-lg)' }, source: 'design: kept-back box padding 10px 12px, radius 8px' },
  { selector: '.actions', values: { gap: '8px', padding: '10px 12px' }, source: 'turnCard .turnCardActions gap 8, padding 10px 12px; the design agrees' },
  { selector: '.actionHint', values: { 'margin-left': 'auto' }, source: 'design: hint margin-left auto' },
];

const CARD_PHONE: Expected[] = [
  { selector: '.scenePov', values: { width: 'auto' }, source: 'phone (≤760, the existing phone breakpoint): POV takes the first line beside the number and remove' },
  { selector: '.sceneSummary', values: { 'flex-basis': '100%' }, source: 'phone: summary gets its own full-width line' },
  { selector: '.modes', values: { 'grid-template-columns': 'minmax(0, 1fr)' }, source: 'phone: one column' },
  { selector: '.actionHint', values: { 'flex-basis': '100%', 'margin-left': '0' }, source: 'phone: hint wraps under the buttons' },
];

const START: Expected[] = [
  {
    selector: '.start',
    values: { 'container-type': 'inline-size', gap: '12px' },
    source: 'design: grids gap 12px; a container so it stacks by its own width, as the chapters list does',
  },
  { selector: '.grid', values: { 'grid-template-columns': 'repeat(3, minmax(0, 1fr))', gap: '12px' }, source: 'design: three columns, gap 12px' },
  { selector: '.alt', values: { gap: '2px', padding: '10px 12px', 'border-radius': 'var(--sh-radius-lg)' }, source: 'design: gap 2px, padding 10px 12px, radius 8px' },
  {
    selector: '.panel',
    values: { gap: '8px', padding: '12px 14px', 'border-radius': 'var(--sh-radius-lg)' },
    source: 'design: panel gap 8px, padding 12px 14px, radius 8px',
  },
  { selector: '.row', values: { gap: '8px' }, source: 'design: button row gap 8px' },
  { selector: '.row .aside', values: { 'margin-left': 'auto' }, source: 'design: aside margin-left auto' },
];

const START_PHONE: Expected[] = [
  { selector: '.grid', values: { 'grid-template-columns': 'minmax(0, 1fr)' }, source: 'one column under a 640px container, the chapters list’s container breakpoint' },
  { selector: '.row .aside', values: { 'flex-basis': '100%', 'margin-left': '0' }, source: 'under 640px the aside wraps under the buttons' },
];

function check(file: string, table: Expected[], media?: string): void {
  const rules = spacingOf(file, media);
  for (const expected of table) expect({ selector: expected.selector, values: rules.get(expected.selector) }).toEqual({ selector: expected.selector, values: expected.values });
  const uncited = [...rules.entries()].filter(([selector, values]) => Object.keys(values).length > 0 && !table.some(e => e.selector === selector)).map(([selector]) => selector);
  expect(uncited).toEqual([]);
}

describe('Plan card spacing', () => {
  it('should keep every spacing value equal to its cited source, and none without one', () => {
    check('PlanCard.module.css', CARD);
    check('PlanStart.module.css', START);
  });

  it('should keep the phone layout’s values cited too', () => {
    check('PlanCard.module.css', CARD_PHONE, '@media (max-width: 760px)');
    check('PlanStart.module.css', START_PHONE, '@container (max-width: 640px)');
  });
});
