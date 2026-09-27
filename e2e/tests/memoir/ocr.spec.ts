/**
 * Importing npm packages
 */
import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { memoirDb, probeMemoirConfigKeys } from '../../lib';
import { expect, test } from './fixtures';
import { errorCodeOf, memoirCsrfHeaders, memoirMutate } from './helpers';

/**
 * Defining types
 */

interface OcrQuotaView {
  cap: number;
  used: number;
  remaining: number;
  resetAt: string;
}

/**
 * Declaring the constants
 *
 * `POST /ocr/parse` and `GET /ocr/quota` (ARCHITECTURE §14.3). The structuring client (`InClusterOcrStructuringClient`)
 * shares memoir-server's one inference seam (`ai.inference-url`) with the AI worker, and that key is unset in this
 * dev cluster today — every real parse attempt fails at the inference hop and the endpoint surfaces that as
 * `503 OCR_002`, never a fabricated result (§14.3's own safety property). The quota guard runs *before* the
 * structuring call (ARCHITECTURE §14.3, `ocr.service.ts:41-56`), so that failure still costs an attempt — proven
 * here directly rather than assumed. A future environment that configures `ai.inference-url` (the dedicated AI
 * test environment being built separately) makes real parses succeed, so the OCR_002-specific assertions guard
 * on a live probe of that key exactly as `billing.spec.ts` does for the billing secrets, rather than assuming
 * today's unconfigured shape forever.
 */

async function getOcrQuota(ctx: APIRequestContext): Promise<OcrQuotaView> {
  const response = await ctx.get('/api/v1/ocr/quota');
  if (!response.ok()) throw new Error(`GET /ocr/quota failed: ${response.status()} ${await response.text()}`);
  return (await response.json()) as OcrQuotaView;
}

async function expectRefusal(response: APIResponse, status: number, code: string): Promise<void> {
  expect(response.status(), `${response.url()} answered ${await response.text()}`).toBe(status);
  expect(await errorCodeOf(response)).toBe(code);
}

/** Today (and offsets from it) in UTC — every persona here onboards with `timezone: 'UTC'`, so this matches the account's own local day exactly. */
function utcDateString(offsetDays = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

test.describe('memoir ocr', () => {
  let aiConfigured: boolean;
  let probeFailed: boolean;

  test.beforeAll(async () => {
    ({ configured: aiConfigured, probeFailed } = await probeMemoirConfigKeys(['AI_INFERENCE_URL']));
  });

  test('should 503 OCR_002 on every parse call while structuring is unconfigured, still consuming quota, and reject once the daily cap is reached with 429 OCR_001', async ({
    memoir,
  }) => {
    test.skip(probeFailed, 'could not read memoir config from the cluster');
    test.skip(aiConfigured, 'ai.inference-url is configured in this environment; the unconfigured-structuring contract does not apply here');

    const persona = await memoir.persona({ label: 'ocr-unconfigured', onboard: true });

    const first = await memoirMutate(persona.ctx, 'post', '/api/v1/ocr/parse', { data: { extractedText: 'Coffee Shop $4.50' } });
    await expectRefusal(first, 503, 'OCR_002');

    const afterFirst = await getOcrQuota(persona.ctx);
    expect(afterFirst.used, 'a failed parse still consumed an attempt — never a free retry').toBe(1);

    const cap = afterFirst.cap;
    for (let attempt = afterFirst.used; attempt < cap; attempt++) {
      const response = await memoirMutate(persona.ctx, 'post', '/api/v1/ocr/parse', { data: { extractedText: `receipt text ${attempt}` } });
      await expectRefusal(response, 503, 'OCR_002');
    }

    const exhausted = await getOcrQuota(persona.ctx);
    expect(exhausted).toMatchObject({ used: cap, remaining: 0 });

    const overCap = await memoirMutate(persona.ctx, 'post', '/api/v1/ocr/parse', { data: { extractedText: 'one receipt too many' } });
    await expectRefusal(overCap, 429, 'OCR_001');
  });

  test('should let exactly the live daily cap succeed at the quota layer when concurrent parse requests race, rejecting the rest with 429 OCR_001', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'ocr-concurrency', onboard: true });
    const { cap } = await getOcrQuota(persona.ctx);
    const csrfHeaders = await memoirCsrfHeaders(persona.ctx);
    const attempts = cap + 7;

    const responses = await Promise.all(
      Array.from({ length: attempts }, (_, index) => persona.ctx.post('/api/v1/ocr/parse', { headers: csrfHeaders, data: { extractedText: `concurrent receipt ${index}` } })),
    );

    const rejected = responses.filter(response => response.status() === 429);
    const admitted = responses.filter(response => response.status() !== 429);
    expect(admitted, `expected exactly the live cap (${cap}) to pass the quota check`).toHaveLength(cap);
    expect(rejected).toHaveLength(attempts - cap);
    for (const response of rejected) expect(await errorCodeOf(response)).toBe('OCR_001');

    const finalQuota = await getOcrQuota(persona.ctx);
    expect(finalQuota).toMatchObject({ used: cap, remaining: 0 });
  });

  test('should reset the OCR quota at the account local midnight rather than a rolling 24h window', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'ocr-midnight-reset', onboard: true });
    const accountId = persona.account!.id;

    const baseline = await getOcrQuota(persona.ctx);
    await memoirDb()`UPDATE accounts SET ocr_quota_count = ${baseline.cap}, ocr_quota_date = ${utcDateString(-1)} WHERE id = ${accountId}`;

    const afterBackdate = await getOcrQuota(persona.ctx);
    expect(afterBackdate, "a count stamped against yesterday's date reads as unused today, however recently it was consumed").toMatchObject({ used: 0, remaining: baseline.cap });

    await memoirMutate(persona.ctx, 'post', '/api/v1/ocr/parse', { data: { extractedText: 'first scan of the new day' } });

    const afterParse = await getOcrQuota(persona.ctx);
    expect(afterParse).toMatchObject({ used: 1, remaining: baseline.cap - 1 });
  });
});
