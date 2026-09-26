import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const SPACING = /^(padding|padding-top|margin|gap|border-radius|width|opacity)$/;

interface Expected {
  selector: string;
  values: Record<string, string>;
  source: string;
}

/** Unwraps the file's one `@media (...) { ... }` block so its nested rules parse as ordinary top-level rules too. */
function unwrapMedia(css: string): string {
  return css.replace(/@media[^{]*\{([\s\S]*)\}\s*$/, '$1');
}

function spacingOf(file: string): Map<string, Record<string, string>> {
  const css = unwrapMedia(readFileSync(new URL(`../src/features/story-bible/${file}`, import.meta.url), 'utf-8'));
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

// Line numbers are in scratch-pad/novel-forge/design/Audit.dc.html (canvas v11). Every value here is either a literal
// canvas number, or a value copied verbatim from an already-reviewed sibling file (cited by file + selector) — never a
// number invented for this file alone. The audit history drawer is not on the canvas (logged as a deviation in the
// task report), so its spacing is copied wholesale from an existing screen rather than designed fresh.
const AUDIT_DIALOG: Expected[] = [
  { selector: '.body', values: { gap: '16px' }, source: 'canvas l.80 dialog content wrapper gap 16px' },
  { selector: '.loading', values: { padding: '48px' }, source: 'copied from components/nf/nf.module.css .paneLoader (padding 48, flex-centered loading state)' },
  {
    selector: '.placeholder',
    values: { margin: '0' },
    source: 'copied from components/nf/BibleTidyDialog.module.css .placeholder (margin 0 — paragraph reset, spacing comes from .body’s gap)',
  },
  { selector: '.group', values: { gap: '8px' }, source: 'canvas l.82 group section gap 8px' },
  {
    selector: '.finding',
    values: { gap: '12px', padding: '12px 14px', 'border-radius': 'var(--sh-radius-lg)' },
    source: 'canvas l.84 finding row: gap 12px, padding 12px 14px, radius 8px (--sh-radius-lg)',
  },
  { selector: '.findingMain', values: { gap: '4px' }, source: 'canvas l.85 finding text column gap 4px' },
  {
    selector: '.findingHead',
    values: { gap: '6px' },
    source:
      'same value as apps/novel-forge-web/src/features/chapter-workspace/ChecksPanel.module.css .findingHead (gap 6px, itself canvas Chapter.dc.html l.165) — reused for this ref+chip row',
  },
  {
    selector: '.findingText',
    values: { margin: '0' },
    source: 'paragraph margin reset; spacing comes from the findingMain column gap (same pattern as ChecksPanel.module.css .hint/.note)',
  },
  {
    selector: '.evidence',
    values: { gap: '4px', margin: '0', padding: '0' },
    source: 'gap: canvas l.85 same text column, reused for the stacked evidence quotes; margin/padding 0: list reset, not a design value',
  },
  { selector: '.withheld', values: { margin: '0' }, source: 'paragraph margin reset; spacing comes from the findingMain column gap' },
  {
    selector: '.decision',
    values: { gap: '8px' },
    source:
      'same value as ChecksPanel.module.css .runRow (gap 8px, canvas Chapter.dc.html l.181 — a control next to its own field); ui-spacing-reference.md rule 6 (8px between controls)',
  },
  {
    selector: '.historyBody',
    values: { gap: '14px' },
    source:
      'same value as ChecksDrawer.module.css .panel (gap 14px, canvas Chapter.dc.html l.144 aside body) — a Drawer body flex column; ui-spacing-reference.md rule 9 (Drawer body gap 14–16)',
  },
  {
    selector: '.historyList',
    values: { gap: '8px', margin: '0', padding: '0' },
    source: 'gap: same control-gap value as .decision above; margin/padding 0: list reset, not a design value',
  },
  {
    selector: '.historyRow',
    values: { width: '100%', gap: '12px', padding: '10px', 'border-radius': 'var(--sh-radius-md)' },
    source:
      'copied verbatim from apps/novel-forge-web/src/features/story-bible/StoryBible.module.css .row (padding 10, gap 12, radius md); width 100% fills the drawer as that row fills its list',
  },
  {
    selector: '.historyMeta',
    values: { gap: '6px' },
    source: 'ui-spacing-reference.md rule 6 (6px chips) — the relative-time label next to its status chips',
  },
];

function uncited(file: string, table: Expected[]): string[] {
  return [...spacingOf(file).entries()].filter(([selector, values]) => Object.keys(values).length > 0 && !table.some(e => e.selector === selector)).map(([selector]) => selector);
}

describe('Bible audit spacing', () => {
  it('should keep every spacing value equal to the value its cited source uses, so drift from the canvas or today’s screens fails here', () => {
    const rules = spacingOf('AuditDialog.module.css');
    for (const expected of AUDIT_DIALOG)
      expect({ selector: expected.selector, values: rules.get(expected.selector) }).toEqual({ selector: expected.selector, values: expected.values });
  });

  it('should not add a spacing value without a cited source, including inside the phone media query', () => {
    expect(uncited('AuditDialog.module.css', AUDIT_DIALOG)).toEqual([]);
  });
});
