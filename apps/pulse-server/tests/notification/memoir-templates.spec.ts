import { describe, expect, it } from 'bun:test';

import { BASELINE_TEMPLATES } from '@server/database/seed/baseline.data';
import { TestEnvironment } from '@tests/test-environment';

const testEnv = new TestEnvironment('memoir_templates_test');

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

describe('Memoir notification templates (T-05, live send + render)', () => {
  testEnv.init();

  const cases: { templateKey: string; payload: Record<string, unknown>; subjectContains: string[]; bodyContains: string[] }[] = [
    {
      templateKey: 'memoir-ai-result-ready',
      payload: { resultId: 'ar_test123', suggestionCount: 4 },
      subjectContains: ['AI review is ready'],
      bodyContains: ['4', 'ar_test123'],
    },
    {
      templateKey: 'memoir-weekly-digest',
      payload: {
        weekStartDate: '2026-08-17',
        weekEndDate: '2026-08-23',
        questsCompletedCount: 11,
        questsScheduledCount: 14,
        netAmount: 182.5,
        currencyCode: 'USD',
        reasonTagCode: 'TIME_CONSTRAINT',
      },
      subjectContains: ['weekly review'],
      bodyContains: ['2026-08-17', '2026-08-23', '11', '14', '182.5', 'USD', 'TIME_CONSTRAINT'],
    },
    {
      templateKey: 'memoir-billing-reminder',
      payload: { state: 'grace', expiresAtDate: '2026-09-01', amount: 4.99, currencyCode: 'USD' },
      subjectContains: ['subscription'],
      bodyContains: ['grace', '2026-09-01', '4.99', 'USD'],
    },
  ];

  for (const testCase of cases) {
    describe(testCase.templateKey, () => {
      it('should be published in dev and accept a real send through POST /api/v1/notifications', async () => {
        const body = { templateKey: testCase.templateKey, recipients: { email: 'memoir-test@example.com' }, payload: testCase.payload };
        const response = await testEnv.getRouter().mockRequest().headers(testEnv.authHeaders()).post('/api/v1/notifications').body(body);

        expect(response.statusCode).toBe(201);
        const json = response.json();
        expect(json.status).toBe('ACCEPTED');
        expect(json.channelResults).toStrictEqual([{ channel: 'EMAIL', status: 'QUEUED', locale: 'en-ZZ', jobId: expect.any(String) }]);
      });

      it('should render the published EN content with the declared variables and no forbidden phrasing', async () => {
        const list = await testEnv.getRouter().mockRequest().headers(testEnv.authHeaders()).get(`/api/v1/templates?key=${testCase.templateKey}`);
        expect(list.statusCode).toBe(200);
        const template = list.json().items.find((item: { templateKey: string }) => item.templateKey === testCase.templateKey);
        expect(template).toBeDefined();

        const preview = await testEnv
          .getRouter()
          .mockRequest()
          .headers(testEnv.authHeaders())
          .post(`/api/v1/templates/${template.id}/versions/preview`)
          .body({ channel: 'EMAIL', data: testCase.payload });

        expect(preview.statusCode).toBe(200);
        const { subject, body } = preview.json();

        for (const fragment of testCase.subjectContains) expect(subject).toContain(fragment);
        for (const fragment of testCase.bodyContains) expect(body).toContain(fragment);
        assertCalmContent(subject, body);
      });
    });
  }
});
