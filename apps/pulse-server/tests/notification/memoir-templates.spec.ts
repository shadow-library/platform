import { describe, expect, it } from 'bun:test';

import { BASELINE_TEMPLATES } from '@server/database/seed/baseline.data';

/**
 * §17's forbidden-notification list, verbatim: no re-engagement copy, no "we miss you", no streak-loss or
 * slip-framed language, no Recovery-quest nudges. Matched case-insensitively against literal template source
 * and rendered output alike.
 */
const FORBIDDEN_PHRASES = [
  're-engage',
  're-engagement',
  'we miss you',
  'miss you',
  'come back',
  "don't lose",
  'lost your streak',
  'streak loss',
  'streak-loss',
  'broke your streak',
  'recovery quest',
  'slipped',
  'slip-up',
  "haven't logged",
  "haven't been back",
  'fell behind',
];

/**
 * Strips the layout shell's `<!doctype>`, the CSS-inliner's `!important`, and Liquid's `!=`/`{% ... %}` tags —
 * none of these is authored copy, so none counts toward the no-exclamation-marks rule.
 */
function stripNonCopyExclamations(text: string): string {
  return text
    .replace(/\{%[^%]*%\}/g, '')
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/!important/g, '')
    .replace(/!=/g, '');
}

function assertCalmContent(...fragments: (string | null | undefined)[]): void {
  const combined = fragments.filter((v): v is string => Boolean(v)).join(' ');
  expect(stripNonCopyExclamations(combined)).not.toContain('!');
  const lowered = combined.toLowerCase();
  for (const phrase of FORBIDDEN_PHRASES) expect(lowered).not.toContain(phrase);
}

describe('Memoir notification templates (T-05, static source scan)', () => {
  const memoirTemplates = BASELINE_TEMPLATES.filter(t => t.templateKey.startsWith('memoir-'));

  it('should define exactly the three ARCHITECTURE §17 memoir EMAIL templates', () => {
    expect(memoirTemplates.map(t => t.templateKey).sort()).toStrictEqual(['memoir-ai-result-ready', 'memoir-billing-reminder', 'memoir-weekly-digest']);
  });

  for (const fixture of memoirTemplates) {
    it(`should keep '${fixture.templateKey}' calm-toned, EMAIL-only, and free of forbidden phrasing/exclamation marks`, () => {
      expect(fixture.channels.map(c => c.channel)).toStrictEqual(['EMAIL']);
      for (const content of fixture.channels) assertCalmContent(content.subject, content.body);
    });

    it(`should restrict '${fixture.templateKey}' variables to identifiers and aggregate numbers, never free text`, () => {
      for (const [name, definition] of Object.entries(fixture.variables)) {
        expect(['string', 'number']).toContain(definition.type);
        if (definition.type === 'string') expect(name.toLowerCase()).toMatch(/(id|date|code|state)$/);
      }
    });
  }
});
