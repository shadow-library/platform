import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const SPACING =
  /^(padding|padding-(top|bottom|left|right|block|inline)|margin|margin-(top|bottom|left|right|block|inline)|gap|border-radius|border-width|width|height|(max|min)-(width|height)|grid-template-columns|line-height|box-shadow|outline-offset|top|right|bottom|left|inset)$/;

type Rules = Map<string, Record<string, string>>;

interface Expected {
  selector: string;
  values: Record<string, string>;
  source: string;
}

/** Every rule keyed by selector, a media query's rules by `@media (...) selector`, so a phone value never masks the desktop one. */
function spacingOf(path: string): Rules {
  const css = readFileSync(new URL(path, import.meta.url), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Rules = new Map();
  const add = (block: string, prefix: string): void => {
    for (const match of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const declarations = Object.fromEntries(
        (match[2] ?? '')
          .split(';')
          .map(line => line.split(':').map(part => part.trim().replace(/\s+/g, ' ')))
          .filter(([property]) => property && SPACING.test(property)),
      );
      if (Object.keys(declarations).length === 0) continue;
      for (const selector of (match[1] ?? '').split(',').map(part => part.trim().replace(/\s+/g, ' '))) {
        const key = `${prefix}${selector}`;
        rules.set(key, { ...rules.get(key), ...declarations });
      }
    }
  };
  let rest = css;
  for (let start = rest.indexOf('@media'); start >= 0; start = rest.indexOf('@media')) {
    const open = rest.indexOf('{', start);
    let depth = 1;
    let end = open + 1;
    while (depth > 0 && end < rest.length) {
      if (rest[end] === '{') depth++;
      if (rest[end] === '}') depth--;
      end++;
    }
    add(rest.slice(open + 1, end - 1), `${rest.slice(start, open).trim()} `);
    rest = rest.slice(0, start) + rest.slice(end);
  }
  add(rest, '');
  return rules;
}

// "StoryBible .x" in a `source` is today's rule in src/features/story-bible/StoryBible.module.css.
const DETAILS: Expected[] = [
  {
    selector: '.stateRow',
    values: { 'grid-template-columns': '150px minmax(0, 1fr)', gap: '10px', padding: '6px 0', 'line-height': '20px' },
    source: 'design: 150px label column, gap 10, padding 6px 0, 13/20 type',
  },
  { selector: '.stateValue', values: { gap: '4px', 'min-width': '0' }, source: 'design: planned-reveal value column gap 4' },
  { selector: '.chips', values: { gap: '6px' }, source: 'design: condition chips gap 6; gap ladder' },
  { selector: '.clueList', values: { gap: '2px', margin: '0', padding: '0' }, source: 'design: who-knows and clue lists gap 2; margin/padding list reset' },
  { selector: '.clueForm', values: { gap: '8px' }, source: 'gap ladder: 8 between controls (input + Add button)' },
  {
    selector: '.editable',
    values: { margin: '-4px -8px', padding: '4px 8px', 'border-radius': 'var(--sh-radius-md)' },
    source:
      'design: side padding 8, radius 6; vertical 4 (not the design 6) so the hover box stays clear of the label above it within today’s 4px label gap (StoryBible .wants); the equal negative margin keeps the text exactly where today’s pane puts it',
  },
  {
    selector: '.editable:hover',
    values: { 'box-shadow': 'inset 0 0 0 1px var(--sh-border-default)' },
    source: 'design: hover 1px border, drawn inset so the box never grows',
  },
  {
    selector: '.editButton',
    values: { top: '0', right: '0' },
    source: 'the explicit Edit control sits in the field box’s own corner, with no offset, so it never changes the text’s layout',
  },
  {
    selector: '.editing',
    values: { gap: '8px', margin: '-4px -8px' },
    source: 'same box as .editable, so opening the editor does not move the text column; gap ladder: 8 to the conflict notice',
  },
  {
    selector: '.editField textarea',
    values: {
      padding: '4px 8px',
      'border-width': '0',
      'border-radius': 'var(--sh-radius-md)',
      'box-shadow': 'inset 0 0 0 1px var(--sh-border-focus), 0 0 0 3px var(--sh-focus-field-ring)',
      'line-height': '1.6',
    },
    source:
      'the .editable box exactly (padding 4px 8px, radius 6, border drawn inset) so the text stays put; line-height 1.6 is StoryBible .prose; ring is the ui field focus ring',
  },
  {
    selector: '.editField textarea:focus',
    values: {
      padding: '4px 8px',
      'border-width': '0',
      'border-radius': 'var(--sh-radius-md)',
      'box-shadow': 'inset 0 0 0 1px var(--sh-border-focus), 0 0 0 3px var(--sh-focus-field-ring)',
      'line-height': '1.6',
    },
    source: 'same as .editField textarea, restated to outrank the ui field’s own :focus rule',
  },
  {
    selector: '@media (hover: none) .editable',
    values: { 'padding-right': 'calc(var(--sh-control-height-sm) + 8px)' },
    source: 'touch screens always show the Edit button (control-height-sm, 28) in the corner; the text stops short of it by the box’s own 8px side padding',
  },
  { selector: '.editingTitle .editField textarea', values: { 'line-height': 'inherit' }, source: 'the name keeps the pane title’s own line height' },
  {
    selector: '.conflict',
    values: { gap: '10px', padding: '10px 12px', 'border-radius': 'var(--sh-radius-lg)' },
    source: 'design: dormant-promise notice: gap 10, padding 10px 12px, radius 8, warning colours',
  },
  {
    selector: '.ladderLink',
    values: { gap: '12px', padding: '10px 14px', 'border-radius': 'var(--sh-radius-lg)' },
    source: 'design: health strip: gap 12, padding 10px 14px, radius 8',
  },
  { selector: '.timeline', values: { gap: '10px' }, source: 'design: section gap 10' },
  { selector: '.timelineHead', values: { gap: '8px' }, source: 'design: heading row gap 8' },
  { selector: '.timelineTitle', values: { margin: '0' }, source: 'heading margin reset; spacing comes from .timeline gap' },
  { selector: '.timelineList', values: { gap: '8px', margin: '0', padding: '0' }, source: 'design: list gap 8; margin/padding list reset' },
  { selector: '.timelineItem', values: { gap: '12px', 'line-height': '21px' }, source: 'design: item gap 12, 14/21 type' },
  { selector: '.timelineChapter', values: { width: '44px', 'padding-top': '2px' }, source: 'design: chapter column width 44, padding-top 2' },
  { selector: '.paneHead', values: { gap: '10px' }, source: 'design: title + chip row gap 10' },
  { selector: '.paneIntro', values: { margin: '0', 'line-height': '22px' }, source: 'design: intro 14/22; paragraph reset' },
  {
    selector: '.ladder',
    values: { 'grid-template-columns': 'minmax(0, 1fr) 420px', gap: '24px' },
    source: 'design: main grid minmax(0, 1fr) 420px, gap 24',
  },
  { selector: '@media (max-width: 960px) .ladder', values: { 'grid-template-columns': 'minmax(0, 1fr)' }, source: 'side-context rule: side context stacks at 960' },
  { selector: '.ladderMain', values: { gap: '14px', 'min-width': '0' }, source: 'design: column gap 14' },
  { selector: '.ladderTitleRow', values: { gap: '10px' }, source: 'design: title + chip gap 10' },
  { selector: '.ladderTitle', values: { margin: '0' }, source: 'design: h1 margin 0' },
  { selector: '.ladderIntro', values: { margin: '0', 'line-height': '22px' }, source: 'design: intro 14/22' },
  { selector: '.viewRow', values: { gap: '8px' }, source: 'design: “Show the ladder as” row gap 8' },
  { selector: '.rungs', values: { gap: '14px' }, source: 'design: rungs sit in the column’s gap 14' },
  {
    selector: '.rung',
    values: { 'grid-template-columns': '44px minmax(0, 1fr) 190px', gap: '12px', width: '100%', padding: '12px 14px', 'border-radius': 'var(--sh-radius-lg)' },
    source: 'design: 44px 1fr 190px, gap 12, padding 12px 14px, radius 8',
  },
  { selector: ".rung[aria-current='true']", values: { 'box-shadow': '0 0 0 3px var(--sh-accent-soft)' }, source: 'design: selected rung ring 3px' },
  { selector: '.rung:focus-visible', values: { 'outline-offset': 'var(--sh-focus-ring-offset)' }, source: 'StoryBible .row:focus-visible ring' },
  {
    selector: '@media (max-width: 760px) .rung',
    values: { 'grid-template-columns': '44px minmax(0, 1fr)' },
    source: 'phone: the 190px chip column drops under the text (760 breakpoint)',
  },
  { selector: '.rungText', values: { gap: '2px', 'min-width': '0' }, source: 'design: name + line gap 2' },
  { selector: '.ladderAside', values: { gap: '14px', 'min-width': '0' }, source: 'design: aside gap 14' },
  {
    selector: '.rungDetail',
    values: { gap: '10px', padding: '16px', 'border-radius': 'var(--sh-radius-lg)' },
    source: 'design: detail section gap 10, padding 16, radius 8',
  },
  { selector: '.rungDetailTitle', values: { margin: '0' }, source: 'heading margin reset; spacing comes from .rungDetail gap' },
  { selector: '.conditionGroup', values: { gap: '10px' }, source: 'design: AND and its condition are siblings in the detail’s gap 10' },
  { selector: '.and', values: { 'padding-left': '10px' }, source: 'design: AND padding-left 10' },
  {
    selector: '.condition',
    values: { gap: '8px', padding: '8px 10px', 'border-radius': 'var(--sh-radius-md)' },
    source: 'design: gap 8, padding 8px 10px, radius 6',
  },
  { selector: '.conditionLabel', values: { 'min-width': '0' }, source: 'design: label flex-grow' },
  { selector: '.detailActions', values: { gap: '8px' }, source: 'design: buttons gap 8' },
  {
    selector: '.conditionRow',
    values: { 'grid-template-columns': 'minmax(0, 2fr) minmax(0, 3fr) auto', gap: '8px' },
    source: 'not on the design (its “Change the conditions” opens it): kind, value and remove share the row by proportion, no fixed width; gap ladder: 8 between controls',
  },
  { selector: '.howItWorks', values: { gap: '8px', padding: '14px', 'border-radius': 'var(--sh-radius-lg)' }, source: 'design: gap 8, padding 14, radius 8' },
  { selector: '.howTitle', values: { margin: '0' }, source: 'design: heading margin reset' },
  { selector: '.howText', values: { margin: '0', 'line-height': '20px' }, source: 'design: 13/20 type' },
  {
    selector: '@media (max-width: 760px) .stateRow',
    values: { 'grid-template-columns': 'minmax(0, 1fr)', gap: '4px' },
    source: 'phone: label above value, header ladder (4px title→subtitle)',
  },
  {
    selector: '.promiseRow',
    values: { gap: '12px', padding: '10px' },
    source: 'copied from StoryBible .row (padding 10, gap 12) without its hover, since a promise row is read-only; design: list rows',
  },
  {
    selector: '.quietNotice',
    values: { gap: '10px', padding: '10px 12px', 'border-radius': 'var(--sh-radius-lg)' },
    source: 'design: quiet-promise notice: gap 10, padding 10px 12px, radius 8, warning colours',
  },
  { selector: '.promiseTable', values: { 'border-radius': 'var(--sh-radius-lg)' }, source: 'design: table: default border, radius 8, overflow hidden' },
  {
    selector: '.promiseGrid',
    values: { 'grid-template-columns': 'minmax(0, 1fr) 80px 110px 170px 170px', gap: '12px' },
    source: 'design: columns minmax(0, 1fr) 80px 110px 170px 170px, gap 12',
  },
  { selector: '.promiseHead', values: { padding: '8px 12px' }, source: 'design: header row padding 8px 12px, well background, 12px 600' },
  { selector: '.promiseBody', values: { padding: '10px 12px' }, source: 'design: body row padding 10px 12px, subtle border-top, 14px' },
  { selector: '.promiseName', values: { 'min-width': '0' }, source: 'design: name + kind column' },
  { selector: '.promiseChips', values: { gap: '6px' }, source: 'gap ladder: 6 between chips' },
  {
    selector: '@media (max-width: 760px) .promiseGrid',
    values: { 'grid-template-columns': 'minmax(0, 1fr)', gap: '4px' },
    source: 'phone: cells stack, each labelled, header ladder (4px title→subtitle)',
  },
];

/** Rules deleted with the markup that used them: the two-column secret card and the truth/writer boxes, replaced by the four-state rows. */
const REMOVED = ['.secretCols', '.secretCol', '.truthBox', '.writerBox', '.ledger', '@media (max-width: 760px) .secretCols'];

/** Rules whose viewport height now reads ui's `--sh-viewport-height` token instead of a hand-rolled `100vh`. */
const VIEWPORT_TOKEN: Record<string, Record<string, string>> = { '.listCol': { 'max-height': 'calc(var(--sh-viewport-height) - 32px)' } };

describe('Story Bible details spacing', () => {
  it('should keep every new spacing value equal to the design value or existing rule it cites', () => {
    const rules = spacingOf('../src/features/story-bible/BibleDetails.module.css');
    for (const expected of DETAILS) expect({ selector: expected.selector, values: rules.get(expected.selector) }).toEqual({ selector: expected.selector, values: expected.values });
  });

  it('should not add a spacing value without a cited source', () => {
    const rules = spacingOf('../src/features/story-bible/BibleDetails.module.css');
    expect([...rules.keys()].filter(selector => !DETAILS.some(expected => expected.selector === selector))).toEqual([]);
  });

  it('should leave every Story Bible rule that is still in use exactly as today’s screen has it', () => {
    const today = spacingOf('./fixtures/story-bible.baseline.module.css');
    const live = spacingOf('../src/features/story-bible/StoryBible.module.css');
    const kept = [...today.entries()].filter(([selector]) => !REMOVED.includes(selector));
    for (const [selector, values] of kept) expect({ selector, values: live.get(selector) }).toEqual({ selector, values: { ...values, ...VIEWPORT_TOKEN[selector] } });
    expect([...live.keys()].filter(selector => !today.has(selector))).toEqual([]);
    expect(REMOVED.filter(selector => live.has(selector))).toEqual([]);
  });
});
