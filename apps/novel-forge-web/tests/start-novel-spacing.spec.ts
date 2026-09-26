import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const SPACING = /^(padding|padding-top|margin|gap|border-radius|width|max-width)$/;

interface Expected {
  selector: string;
  values: Record<string, string>;
  source: string;
}

function spacingOf(file: string): Map<string, Record<string, string>> {
  const css = readFileSync(new URL(`../src/features/projects/${file}`, import.meta.url), 'utf-8');
  const rules = new Map<string, Record<string, string>>();
  for (const match of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)) {
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

// Line numbers are in scratch-pad/novel-forge/design/Start.dc.html (canvas v11); "reference" is scratch-pad/novel-forge/ui-spacing-reference.md.
const DIALOG: Expected[] = [
  { selector: '.form', values: { gap: '16px' }, source: 'canvas l.78 dialog form gap 16px; reference "New-novel modal" form gap 16 (today’s value kept)' },
  {
    selector: '.hint',
    values: { 'border-radius': 'var(--sh-radius-md)', padding: '12px' },
    source: 'canvas l.88 hint padding 12px radius 6px; reference "New-novel modal" hint padding 12 (today’s value kept)',
  },
  { selector: '.hintRow', values: { gap: '8px' }, source: 'canvas l.88 hint gap 8px; today’s .hintRow gap 8 kept' },
];

function uncited(file: string, table: Expected[]): string[] {
  return [...spacingOf(file).entries()].filter(([selector, values]) => Object.keys(values).length > 0 && !table.some(e => e.selector === selector)).map(([selector]) => selector);
}

describe('Start dialog spacing', () => {
  it('should keep every spacing value equal to the value its cited source uses', () => {
    const dialog = spacingOf('NewNovelModal.module.css');
    for (const expected of DIALOG) expect({ selector: expected.selector, values: dialog.get(expected.selector) }).toEqual({ selector: expected.selector, values: expected.values });
  });

  it('should not add a spacing value without a cited source', () => {
    expect(uncited('NewNovelModal.module.css', DIALOG)).toEqual([]);
  });
});

const UI = new URL('../../../packages/ui/src/', import.meta.url);

function px(css: string, selector: string, property: string): number {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  const value = new RegExp(`(?:^|;|\\s)${property}:\\s*([0-9.]+)px`).exec(block)?.[1];
  if (value === undefined) throw new TypeError(`${selector} has no ${property} in px`);
  return Number(value);
}

describe('Start dialog width', () => {
  const dialogCss = readFileSync(new URL('components/Dialog/Dialog.module.css', UI), 'utf-8');
  const tokensCss = readFileSync(new URL('styles/tokens.css', UI), 'utf-8');
  const panelMax = px(dialogCss, ".panel[data-size='md']", 'max-width');
  const panelPad = px(dialogCss, '.panel', 'padding');
  const positionerPad = px(dialogCss, '.positioner', 'padding');
  const border = Number(/--sh-border-width:\s*([0-9.]+)px/.exec(tokensCss)?.[1]);
  const contentWidth = (viewport: number): number => Math.min(panelMax, viewport - positionerPad * 2) - panelPad * 2 - border * 2;

  it('should read the md panel geometry the dialog is built on', () => {
    expect({ panelMax, panelPad, positionerPad, border }).toEqual({ panelMax: 560, panelPad: 24, positionerPad: 16, border: 1 });
  });

  it('should give the form 308px on a 390px phone and the full 510px from 768px up', () => {
    expect([390, 768, 1024, 1280].map(contentWidth)).toEqual([308, 510, 510, 510]);
  });
});
