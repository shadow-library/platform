import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const SPACING = /^(padding|padding-top|margin|gap|border-radius|width)$/;
const SETTINGS_CSS = '../src/routes/_app/settings.module.css';
const PROJECT_SETTINGS_CSS = '../src/routes/novels/$novelId/settings.module.css';

function rulesOf(path: string): Map<string, Record<string, string>> {
  const css = readFileSync(new URL(path, import.meta.url), 'utf-8');
  const rules = new Map<string, Record<string, string>>();
  for (const match of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const declarations = Object.fromEntries(
      (match[2] ?? '')
        .split(';')
        .map(line => line.split(':').map(part => part.trim()))
        .filter(([property, value]) => property && value),
    );
    for (const selector of (match[1] ?? '').split(',').map(part => part.trim())) rules.set(selector, { ...rules.get(selector), ...declarations });
  }
  return rules;
}

function spacingOf(path: string, selector: string): Record<string, string> {
  return Object.fromEntries(Object.entries(rulesOf(path).get(selector) ?? {}).filter(([property]) => SPACING.test(property)));
}

// Each account Settings rule is paired with the project "Model & cost" tab rule it mirrors, read live from both files,
// so the one cost-tier row on this page keeps the same card, head and row spacing as the tier row a project shows.
const MIRRORED: { selector: string; source: string; property: string }[] = [
  { selector: '.page', source: '.form', property: 'gap' },
  { selector: '.group', source: '.modelGroup', property: 'border-radius' },
  { selector: '.groupHead', source: '.modelGroupHead', property: 'padding' },
  { selector: '.row', source: '.roleRow', property: 'padding' },
  { selector: '.row', source: '.roleRowWrap', property: 'gap' },
];

// Kept from the Settings page as it stood before the per-model rows were removed; neither has a project-tab counterpart.
const KEPT: Record<string, Record<string, string>> = {
  '.groupHead': { margin: '0' },
  '.saveRow': { gap: '12px' },
};

describe('Account settings spacing', () => {
  it('should keep every mirrored spacing value equal to the project Model & cost tab’s live rule', () => {
    for (const { selector, source, property } of MIRRORED) {
      const own = spacingOf(SETTINGS_CSS, selector)[property];
      const mirrored = spacingOf(PROJECT_SETTINGS_CSS, source)[property];
      expect(mirrored).toBeDefined();
      expect({ selector, property, value: own }).toEqual({ selector, property, value: mirrored });
    }
  });

  it('should keep the spacing values carried over from the previous Settings page', () => {
    for (const [selector, values] of Object.entries(KEPT)) expect({ selector, values: spacingOf(SETTINGS_CSS, selector) }).toMatchObject({ selector, values });
  });

  it('should carry no spacing declaration that is neither mirrored nor kept', () => {
    const cited = (selector: string, property: string): boolean =>
      MIRRORED.some(rule => rule.selector === selector && rule.property === property) || KEPT[selector]?.[property] !== undefined;
    const uncited = [...rulesOf(SETTINGS_CSS).keys()].flatMap(selector =>
      Object.keys(spacingOf(SETTINGS_CSS, selector))
        .filter(property => !cited(selector, property))
        .map(property => `${selector} ${property}`),
    );

    expect(uncited).toEqual([]);
  });
});
