import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const SPACING = /^(padding|padding-top|margin|gap|border-radius|width|opacity)$/;

interface Expected {
  selector: string;
  values: Record<string, string>;
  source: string;
}

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

function spacingOf(path: string): Map<string, Record<string, string>> {
  const rules = new Map<string, Record<string, string>>();
  for (const [selector, declarations] of rulesOf(path)) rules.set(selector, Object.fromEntries(Object.entries(declarations).filter(([property]) => SPACING.test(property))));
  return rules;
}

// EntityImages.tsx renders the "Portrait & gallery" section extracted out of story-bible/EntityPane.tsx (T39).
// `.imagesSection` is a straight copy of the container it lived in there, and must stay declaration-for-declaration
// identical to it (compared against the live file, not a hardcoded table, so any future drift on either side fails
// here); `.label` is reused directly from StoryBible.module.css rather than redefined, so there is nothing to copy.
describe('Entity images extraction — no drift from the container it was copied out of', () => {
  it('should keep every declaration on .imagesSection equal to story-bible/StoryBible.module.css’s own rule', () => {
    const original = rulesOf('../src/features/story-bible/StoryBible.module.css').get('.imagesSection');
    const extracted = rulesOf('../src/features/illustrations/EntityImages.module.css').get('.imagesSection');

    expect(original).toBeDefined();
    expect(extracted).toEqual(original);
  });

  it('should reuse StoryBible’s .label instead of redefining it', () => {
    expect(rulesOf('../src/features/illustrations/EntityImages.module.css').has('.label')).toBe(false);

    const source = readFileSync(new URL('../src/features/illustrations/EntityImages.tsx', import.meta.url), 'utf-8');
    expect(source).toContain('storyBibleStyles.label');
  });
});

// "reference" is scratch-pad/novel-forge/ui-spacing-reference.md; values are copied from this app's own
// ReferenceImages.module.css (.row), the sibling panel the new dating rows are modelled on, per rule zero
// ("reuse the existing component or copy the existing screen's values"). These rules have no main-branch
// original to diff against — they are new UI this task adds — so they stay allowlisted and cited instead.
const NEW_RULES: Expected[] = [
  {
    selector: '.dateField',
    values: { gap: '8px', padding: '8px', 'border-radius': 'var(--sh-radius-md)' },
    source: 'ReferenceImages.module.css .row padding 8px, radius md; reference rule 6 (8px between controls)',
  },
  { selector: '.futureRow', values: { gap: '8px' }, source: 'ReferenceImages.module.css .rowControls/.actions gap 8px; reference rule 6 (8px between controls)' },
  { selector: '.futureInput', values: { width: '120px' }, source: 'ReferenceImages.module.css .roleSelect width 120px' },
];

function uncited(file: string, table: Expected[]): string[] {
  const skip = new Set(['.imagesSection', '.label']);
  return [...spacingOf(file).entries()]
    .filter(([selector, values]) => !skip.has(selector) && Object.keys(values).length > 0 && !table.some(e => e.selector === selector))
    .map(([selector]) => selector);
}

describe('Entity images spacing — new rules', () => {
  it('should keep every spacing value equal to the value its cited source uses, so drift from the canvas or today’s screens fails here', () => {
    const rules = spacingOf('../src/features/illustrations/EntityImages.module.css');
    for (const expected of NEW_RULES)
      expect({ selector: expected.selector, values: rules.get(expected.selector) }).toEqual({ selector: expected.selector, values: expected.values });
  });

  it('should not add a spacing value without a cited source', () => {
    expect(uncited('../src/features/illustrations/EntityImages.module.css', NEW_RULES)).toEqual([]);
  });
});
