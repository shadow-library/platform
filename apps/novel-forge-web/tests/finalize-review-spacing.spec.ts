import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const SPACING = /^(padding|padding-left|margin|margin-left|gap|border-radius|width|opacity)$/;

type Rules = Map<string, Record<string, string>>;

interface Expected {
  selector: string;
  values: Record<string, string>;
  source: string;
  /** The rule in a sibling stylesheet (live, or frozen from main under tests/fixtures) whose values this one keeps; checked, not just cited. */
  baseline?: { file: string; selector: string };
}

function rulesOf(css: string): Rules {
  const rules: Rules = new Map();
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = Object.fromEntries(
      (match[2] ?? '')
        .split(';')
        .map(line => line.split(':').map(part => part.trim()))
        .filter(([property]) => property && SPACING.test(property)),
    );
    if (Object.keys(declarations).length === 0) continue;
    for (const selector of (match[1] ?? '').split(',').map(part => part.trim().replace(/\s+/g, ' '))) rules.set(selector, { ...rules.get(selector), ...declarations });
  }
  return rules;
}

function spacingOf(path: string): { base: Rules; phone: Rules } {
  const css = readFileSync(new URL(path, import.meta.url), 'utf-8');
  const start = css.indexOf('@media (max-width: 760px)');
  if (start < 0) return { base: rulesOf(css), phone: new Map() };
  return { base: rulesOf(css.slice(0, start)), phone: rulesOf(css.slice(css.indexOf('{', start) + 1)) };
}

const AUDIT = '../src/features/story-bible/AuditDialog.module.css';
const FINALIZE_BUTTON = './fixtures/finalize-button.baseline.module.css';

// "l.N" is a line in scratch-pad/novel-forge/design/Updates.dc.html (canvas v11, frame 8 "Finalize — what needs your call first");
// "rule N" is scratch-pad/novel-forge/ui-spacing-reference.md. The canvas call card is the audit dialog's finding card, so those
// values are also checked against the live audit stylesheet, so the two cards cannot drift apart.
const DIALOG: Expected[] = [
  { selector: '.body', values: { gap: '16px' }, source: 'l.38 scroll body gap 16', baseline: { file: AUDIT, selector: '.body' } },
  { selector: '.loading', values: { padding: '48px' }, source: 'AuditDialog .loading', baseline: { file: AUDIT, selector: '.loading' } },
  { selector: '.preparing', values: { gap: '8px' }, source: 'ChecksPanel .running gap 8 (the same spinner + line); rule 6' },
  { selector: '.note', values: { margin: '0' }, source: 'paragraph reset; spacing comes from .body’s gap', baseline: { file: AUDIT, selector: '.placeholder' } },
  { selector: '.section', values: { gap: '8px' }, source: 'l.39 “Needs your call” section gap 8', baseline: { file: AUDIT, selector: '.group' } },
  {
    selector: '.card',
    values: { gap: '12px', padding: '12px 14px', 'border-radius': 'var(--sh-radius-lg)' },
    source: 'l.42 call card gap 12, padding 12px 14px, radius 8',
    baseline: { file: AUDIT, selector: '.finding' },
  },
  { selector: ".card[data-decision='skipped']", values: { opacity: '0.5' }, source: 'l.42 skipped card opacity .5' },
  { selector: '.main', values: { gap: '4px' }, source: 'l.44 card text column gap 4', baseline: { file: AUDIT, selector: '.findingMain' } },
  { selector: '.head', values: { gap: '8px' }, source: 'l.45 title + tag gap 8' },
  { selector: '.form', values: { gap: '6px' }, source: 'ChecksPanel .form gap 6 (the dismiss-with-reason form, Chapter l.169)' },
  { selector: '.formActions', values: { gap: '8px' }, source: 'rule 6 (8px between controls)' },
  { selector: '.problem', values: { margin: '0' }, source: 'paragraph reset; spacing comes from .main’s gap' },
  { selector: '.routine', values: { gap: '8px', 'border-radius': 'var(--sh-radius-lg)' }, source: 'l.59 routine section gap 8, radius 8' },
  { selector: '.routineHead', values: { gap: '10px', padding: '10px 12px' }, source: 'l.60 routine header gap 10, padding 10px 12px' },
  { selector: '.routineToggle', values: { padding: '0' }, source: 'l.61 .link padding 0' },
  { selector: '.keepAll', values: { 'margin-left': 'auto' }, source: 'l.63 Keep all margin-left auto' },
  { selector: '.routineList', values: { gap: '6px', margin: '0', padding: '0 12px 12px' }, source: 'l.66 routine list gap 6, padding 0 12px 12px' },
  { selector: '.routineRow', values: { gap: '10px' }, source: 'l.68 routine row gap 10' },
  { selector: ".routineRow[data-decision='skipped']", values: { opacity: '0.5' }, source: 'l.68 skipped row opacity .5' },
  { selector: '.routineKind', values: { width: '150px' }, source: 'l.68 kind column width 150' },
  { selector: '.routineActions', values: { gap: '8px' }, source: 'rule 6 (8px between controls) — the canvas row has one link, this one Keep and Skip' },
  { selector: '.link', values: { padding: '0' }, source: 'l.23 .link padding 0' },
  {
    selector: '.bridge',
    values: { gap: '8px', padding: '10px 12px', 'border-radius': 'var(--sh-radius-lg)' },
    source: 'the bridge block: the routine section’s gap 8 and radius 8 (l.59) with the disclosure line’s padding 10px 12px (l.73)',
  },
  { selector: '.bridgeSummary', values: { margin: '0' }, source: 'paragraph reset; spacing comes from .bridge’s gap' },
  {
    selector: '.disclosure',
    values: { gap: '10px', padding: '10px 12px', 'border-radius': 'var(--sh-radius-lg)' },
    source: 'l.73 disclosure line gap 10, padding 10px 12px, radius 8',
  },
  { selector: '.disclosureLink', values: { 'margin-left': 'auto' }, source: 'l.73 “What was checked” margin-left auto' },
  { selector: '.checked', values: { padding: '0 12px' }, source: 'l.74 checked note padding 0 12px' },
  {
    selector: '.reasons',
    values: { gap: '6px', margin: '0', 'padding-left': '18px' },
    source: 'the blocker list the old Finalize popover showed (FinalizeButton.module.css .reasons on main)',
    baseline: { file: FINALIZE_BUTTON, selector: '.reasons' },
  },
  { selector: '.footer', values: { gap: '16px' }, source: 'l.76 footer gap 16 (padding stays the ui Dialog footer’s own)' },
  { selector: '.autoKeep', values: { gap: '16px' }, source: 'l.76 footer gap 16 between the label and each checkbox' },
  { selector: '.back', values: { 'margin-left': 'auto' }, source: 'l.80 Back to the chapter margin-left auto' },
];

const DIALOG_PHONE: Expected[] = [{ selector: '.routineKind', values: { width: '100%' }, source: 'phone: the kind label takes its own line, as AuditDialog stacks .findingMain' }];

function check(rules: Rules, table: Expected[]): void {
  for (const expected of table) {
    expect({ selector: expected.selector, values: rules.get(expected.selector) }).toEqual({ selector: expected.selector, values: expected.values });
    if (!expected.baseline) continue;
    const today = spacingOf(expected.baseline.file).base.get(expected.baseline.selector) ?? {};
    const kept = Object.fromEntries(Object.keys(expected.values).map(property => [property, today[property]]));
    expect({ selector: expected.selector, kept }).toEqual({ selector: expected.selector, kept: expected.values });
  }
  const uncited = [...rules.keys()].filter(selector => !table.some(entry => entry.selector === selector));
  expect(uncited).toEqual([]);
}

describe('Finalize review spacing', () => {
  const dialog = spacingOf('../src/features/chapter-workspace/FinalizeReviewDialog.module.css');

  it('should keep every spacing value equal to its cited source — the sibling stylesheet’s value where it names one — and cite every one', () => {
    check(dialog.base, DIALOG);
  });

  it('should keep every phone override cited', () => {
    check(dialog.phone, DIALOG_PHONE);
  });
});
