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

// Line numbers are in scratch-pad/novel-forge/design/NextChapter.dc.html (canvas v11); "reference" is scratch-pad/novel-forge/ui-spacing-reference.md;
// "turnCard" is today's chat proposal card in routes/novels/$novelId/chat.module.css, whose frame the plan card keeps (P4-9).
const CARD: Expected[] = [
  {
    selector: '.card',
    values: { width: '100%', 'max-width': '720px', 'margin-top': '8px', 'border-radius': 'var(--sh-radius-lg)' },
    source: 'turnCard: width 100%, max-width 720px, margin-top 8px, radius lg (chat.module.css); canvas l.121 radius 8px',
  },
  { selector: '.card[data-indent]', values: { 'max-width': '680px', 'margin-left': '40px' }, source: 'canvas l.121 margin-left 40px inside the 720px column (720 − 40)' },
  { selector: '.head', values: { gap: '8px', padding: '10px 12px' }, source: 'turnCard .turnCardHead gap 8, padding 10px 12px; canvas l.122 identical' },
  { selector: '.length', values: { gap: '6px', 'margin-left': 'auto' }, source: 'canvas l.125 length control gap 6px, margin-left auto' },
  { selector: '.alert', values: { padding: '10px 12px' }, source: 'turnCard .turnCardNote/.turnCardWarning padding 10px 12px' },
  { selector: '.body', values: { gap: '12px', margin: '0', padding: '14px' }, source: 'canvas l.127 plan body padding 14px, gap 12px; margin reset for fieldset' },
  { selector: '.recap', values: { gap: '4px' }, source: 'reference rule 6 (4 title→subtitle)' },
  { selector: '.field', values: { gap: '4px' }, source: 'canvas l.128 label→field gap 4px' },
  { selector: '.group', values: { gap: '6px' }, source: 'canvas l.130 scenes group gap 6px (l.153 milestones, l.161 content mode alike)' },
  { selector: '.scenes', values: { gap: '6px', margin: '0', padding: '0' }, source: 'canvas l.130 scenes group gap 6px; list margin and padding reset' },
  { selector: '.sceneBlock', values: { gap: '4px' }, source: 'canvas l.128 gap 4px: a scene’s details sit under its row as a field under its label' },
  { selector: '.scene', values: { gap: '8px' }, source: 'canvas l.133 scene row gap 8px' },
  { selector: '.sceneNumber', values: { width: '20px' }, source: 'canvas l.134 scene number width 20px' },
  { selector: '.scenePov', values: { width: '96px' }, source: 'canvas l.136 scene POV select width 96px' },
  { selector: '.hint', values: { margin: '0' }, source: 'paragraph margin reset; spacing comes from the column gap' },
  {
    selector: '.pooling',
    values: { gap: '8px', padding: '10px 12px', 'border-radius': 'var(--sh-radius-lg)' },
    source: 'canvas l.146 pooling note gap 8px, padding 10px 12px, radius 8px',
  },
  { selector: '.poolingActions', values: { gap: '8px' }, source: 'canvas l.148 pooling actions gap 8px' },
  {
    selector: '.diagnostics',
    values: { gap: '6px', margin: '0', padding: '10px 12px', 'border-radius': 'var(--sh-radius-md)' },
    source: 'ChecksPanel.module.css .notice: gap 6px, padding 10px 12px, radius md (today’s diagnostic box)',
  },
  { selector: '.moreSummary', values: { width: 'fit-content' }, source: 'the disclosure is as wide as its words, like the canvas l.142 “Add a scene” (align-self flex-start)' },
  { selector: '.moreBody', values: { gap: '12px', 'padding-top': '8px' }, source: 'canvas l.127 field gap 12px; reference rule 6 (8 between controls) under the summary' },
  { selector: '.chips', values: { gap: '6px' }, source: 'canvas l.155 and l.175 chip rows gap 6px; reference rule 6 (6 chips)' },
  { selector: '.chip', values: { 'max-width': '100%' }, source: 'a chip never overflows its row at 390 (no horizontal scroll)' },
  { selector: '.modes', values: { 'grid-template-columns': 'repeat(2, minmax(0, 1fr))', gap: '8px' }, source: 'canvas l.163 two columns, gap 8px' },
  {
    selector: '.mode',
    values: { gap: '2px', padding: '10px 12px', 'border-radius': 'var(--sh-radius-lg)' },
    source: 'canvas l.165 mode radio gap 2px, padding 10px 12px, radius 8px',
  },
  { selector: '.modeNote', values: { padding: '8px 10px', 'border-radius': 'var(--sh-radius-md)' }, source: 'canvas l.169 unrestricted note padding 8px 10px, radius 6px' },
  {
    selector: '.writer',
    values: { gap: '8px', padding: '12px 14px', 'border-radius': 'var(--sh-radius-lg)' },
    source: 'canvas l.172 writer box gap 8px, padding 12px 14px, radius 8px',
  },
  { selector: '.writerHead', values: { gap: '8px' }, source: 'canvas l.173 writer box head gap 8px' },
  { selector: '.kept', values: { padding: '10px 12px', 'border-radius': 'var(--sh-radius-lg)' }, source: 'canvas l.179 kept-back box padding 10px 12px, radius 8px' },
  { selector: '.actions', values: { gap: '8px', padding: '10px 12px' }, source: 'turnCard .turnCardActions gap 8, padding 10px 12px; canvas l.185 identical' },
  { selector: '.actionHint', values: { 'margin-left': 'auto' }, source: 'canvas l.188 hint margin-left auto' },
];

const CARD_PHONE: Expected[] = [
  { selector: '.card[data-indent]', values: { 'max-width': 'none', 'margin-left': '0' }, source: 'phone: no indent, the card takes the column (reference §2.2.10 one column)' },
  { selector: '.scenePov', values: { width: 'auto' }, source: 'phone (≤760, reference breakpoint): POV takes the first line beside the number and remove' },
  { selector: '.sceneSummary', values: { 'flex-basis': '100%' }, source: 'phone: summary gets its own full-width line' },
  { selector: '.modes', values: { 'grid-template-columns': 'minmax(0, 1fr)' }, source: 'phone: one column (reference §2.2.10 one column)' },
  { selector: '.actionHint', values: { 'flex-basis': '100%', 'margin-left': '0' }, source: 'phone: hint wraps under the buttons' },
];

const START: Expected[] = [
  {
    selector: '.start',
    values: { 'container-type': 'inline-size', gap: '12px' },
    source: 'canvas l.84/l.96 grids gap 12px; a container so it stacks by its own width, as the chapters list does',
  },
  { selector: '.start[data-indent]', values: { 'margin-left': '40px' }, source: 'canvas l.84, l.96 and l.104 margin-left 40px under the assistant’s avatar' },
  { selector: '.grid', values: { 'grid-template-columns': 'repeat(3, minmax(0, 1fr))', gap: '12px' }, source: 'canvas l.84 and l.96 three columns, gap 12px' },
  { selector: '.alt', values: { gap: '2px', padding: '10px 12px', 'border-radius': 'var(--sh-radius-lg)' }, source: 'canvas l.33 .alt gap 2px, padding 10px 12px, radius 8px' },
  {
    selector: '.panel',
    values: { gap: '8px', padding: '12px 14px', 'border-radius': 'var(--sh-radius-lg)' },
    source: 'canvas l.104 and l.112 panel gap 8px, padding 12px 14px, radius 8px',
  },
  { selector: '.row', values: { gap: '8px' }, source: 'canvas l.107 button row gap 8px' },
  { selector: '.row .aside', values: { 'margin-left': 'auto' }, source: 'canvas l.107 aside margin-left auto' },
];

const START_PHONE_INDENT: Expected[] = [{ selector: '.start[data-indent]', values: { 'margin-left': '0' }, source: 'phone (≤760): no indent, as the plan card' }];

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
    check('PlanStart.module.css', START_PHONE_INDENT, '@media (max-width: 760px)');
  });
});
