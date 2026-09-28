/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, mutate, requireProductUrl } from '../../lib';

/**
 * Defining types
 */

interface MemoirTemplateCase {
  templateKey: string;
  data: Record<string, unknown>;
  expectedSubject: string | RegExp;
  /**
   * Substrings anchored on the substituted value's own boundary (its text plus the tag that immediately follows
   * or precedes it), never on a fixed opening tag — publishing composes the content into the baseline layout and
   * `juice` then inlines that layout's `<style>` rules onto matching elements (`.email-strong`, `.email-meta td`),
   * rewriting opening-tag attributes. Anchoring past the opening tag keeps the assertion immune to that rewrite.
   */
  expectedBodySubstrings: string[];
}

/**
 * Declaring the constants
 *
 * The three memoir EMAIL templates in the baseline catalog (`apps/pulse-server/src/database/seed/baseline.data.ts`'s
 * `BASELINE_TEMPLATES`), rendered through the studio preview API (`POST /versions/preview`) rather than a real send.
 * Preview needs no draft, no publish and no cleanup — it reads the already-PUBLISHED baseline version and renders it
 * against caller-supplied data, so this is read-only against seeded state; `send-delivery.spec.ts` covers the send itself.
 */
const CASES: MemoirTemplateCase[] = [
  {
    templateKey: 'memoir-ai-result-ready',
    data: { resultId: 'e2e-ar-preview', suggestionCount: 7 },
    expectedSubject: 'Your AI review is ready',
    expectedBodySubstrings: ['Reference: e2e-ar-preview.', '7</span> suggestion(s)'],
  },
  {
    templateKey: 'memoir-weekly-digest',
    data: {
      weekStartDate: '2026-01-01',
      weekEndDate: '2026-01-07',
      questsCompletedCount: 9,
      questsScheduledCount: 10,
      netAmount: 123.45,
      currencyCode: 'USD',
      reasonTagCode: 'E2E_TAG',
    },
    expectedSubject: 'Your weekly review is ready',
    expectedBodySubstrings: ['Summary for 2026-01-01 to 2026-01-07.', '9 of 10</td>', '123.45 USD</td>', 'Recurring pattern', 'E2E_TAG</td>'],
  },
  {
    templateKey: 'memoir-billing-reminder',
    data: { state: 'active', expiresAtDate: '2026-02-01', amount: 9.99, currencyCode: 'USD' },
    // `seedBaseline` (`baseline.seed.ts:89-92`) inserts a template's content only when it has no PUBLISHED version
    // yet, so it never updates an already-seeded row — an environment seeded before `baseline.data.ts:626`'s
    // wording changed keeps the earlier "About your Memoir subscription", so this tolerates either.
    expectedSubject: /^About your (Shadow )?Memoir subscription$/,
    expectedBodySubstrings: ['status is ', 'active</span>', '2026-02-01</span>', 'Renewal amount: 9.99 USD'],
  },
];

test.describe('memoir template preview', () => {
  test.beforeEach(() => requireProductUrl('pulse'));

  for (const testCase of CASES) {
    test(`should render ${testCase.templateKey} via the studio preview API with the declared variables substituted`, async () => {
      const ctx = await apiContext('pulse', 'admin');

      const list = await ctx.get(`/api/v1/templates?key=${testCase.templateKey}`);
      expect(list.status(), await list.text()).toBe(200);
      const { items } = (await list.json()) as { items: { id: string; templateKey: string }[] };
      const template = items.find(item => item.templateKey === testCase.templateKey);
      expect(template, `expected the baseline "${testCase.templateKey}" template to exist`).toBeTruthy();

      const preview = await mutate(ctx, 'post', `/api/v1/templates/${template?.id}/versions/preview`, {
        data: { channel: 'EMAIL', locale: 'en-ZZ', data: testCase.data },
      });
      expect(preview.status(), await preview.text()).toBe(200);
      const body = (await preview.json()) as { subject?: string | null; body: string };

      expect(body.subject).toMatch(testCase.expectedSubject);
      for (const substring of testCase.expectedBodySubstrings) expect(body.body, `expected the rendered body to contain "${substring}"`).toContain(substring);
    });
  }
});
