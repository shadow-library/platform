import { type APIRequestContext, type APIResponse } from '@playwright/test';

import { memoirDb } from '../../lib';
import { expect, test } from './fixtures';
import { createDailyQuest, errorCodeOf, memoirCsrfHeaders, memoirMutate } from './helpers';

interface AiTaskView {
  id: string;
  status: string;
  kind: string;
  submittedAt: string;
  expectedBy: string;
  error?: string | null;
}

interface AiConsentView {
  dataClass: string;
  granted: boolean;
  grantedAt?: string | null;
  withdrawnAt?: string | null;
}

/**
 * `POST /ai/tasks`, `/tasks/{id}/cancel`, `/consents`, `/scheduled-query` and `/results/{id}/apply`. `AiExecutorService.drain()` fires only from a sweep; inference goes through
 * Synapse
 * (task `memoir.insight`), routed to local Ollama in the test environment. Submit, consent and apply are synchronous and never reach inference. The cancel test races the sweep:
 * `claimNext` (`ai-worker.repository.ts`) can claim any `pending` task on the sweep's cadence (`ai.batch-poll-interval-minutes`, default 5), so a cancel answers 200 (refunded)
 * or 409 `AI_004`
 * (already claimed), and the test asserts the contract of whichever happened.
 *
 * The free- and paid-tier caps (`quotas.ai-free-monthly`/`quotas.ai-paid-daily`) are discovered through real submissions, as no `GET` route exposes them (see `ocr.spec.ts`).
 */

const QUOTA_DISCOVERY_CEILING = 60;

async function expectRefusal(response: APIResponse, status: number, code: string): Promise<void> {
  expect(response.status(), `${response.url()} answered ${await response.text()}`).toBe(status);
  expect(await errorCodeOf(response)).toBe(code);
}

function submitAiTask(ctx: APIRequestContext, queryText: string, id: string = crypto.randomUUID()): Promise<APIResponse> {
  return memoirMutate(ctx, 'post', '/api/v1/ai/tasks', { data: { id, queryText } });
}

function cancelAiTask(ctx: APIRequestContext, id: string): Promise<APIResponse> {
  return memoirMutate(ctx, 'post', `/api/v1/ai/tasks/${id}/cancel`);
}

async function getConsents(ctx: APIRequestContext): Promise<AiConsentView[]> {
  const response = await ctx.get('/api/v1/ai/consents');
  if (!response.ok()) throw new Error(`GET /ai/consents failed: ${response.status()} ${await response.text()}`);
  return ((await response.json()) as { consents: AiConsentView[] }).consents;
}

/** Submits distinct-id tasks until one is refused `AI_001`/`AI_002`, returning how many were admitted first: the live cap. */
async function discoverQuotaCap(ctx: APIRequestContext, exhaustedCode: 'AI_001' | 'AI_002'): Promise<number> {
  for (let admitted = 0; admitted < QUOTA_DISCOVERY_CEILING; admitted++) {
    const response = await submitAiTask(ctx, `quota discovery probe ${admitted}`);
    if (response.status() === 201) continue;
    const code = await errorCodeOf(response);
    if (code === exhaustedCode) return admitted;
    throw new Error(`unexpected ai/tasks response while discovering the quota cap: ${response.status()} ${code} ${await response.text()}`);
  }
  throw new Error(`did not hit ${exhaustedCode} within ${QUOTA_DISCOVERY_CEILING} submissions`);
}

test.describe('memoir ai', () => {
  test('should block a free-tier submission past the monthly AI quota with 402 AI_001, staying exhausted on a further attempt', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'ai-free-quota', onboard: true });

    const cap = await discoverQuotaCap(persona.ctx, 'AI_001');
    expect(cap, 'the free tier must cap submissions somewhere below the discovery ceiling').toBeGreaterThan(0);

    const stillExhausted = await submitAiTask(persona.ctx, 'one free-tier question too many');
    await expectRefusal(stillExhausted, 402, 'AI_001');
  });

  test('should block a paid-tier submission past the daily AI quota with 429 AI_002', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'ai-paid-quota', onboard: true });
    const accountId = persona.account!.id;
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await memoirDb()`INSERT INTO entitlements (account_id, tier, state, expires_at) VALUES (${accountId}, 'paid', 'active', ${future})`;

    const cap = await discoverQuotaCap(persona.ctx, 'AI_002');
    expect(cap, 'the paid tier must cap submissions somewhere below the discovery ceiling').toBeGreaterThan(0);

    const stillExhausted = await submitAiTask(persona.ctx, 'one paid-tier question too many');
    await expectRefusal(stillExhausted, 429, 'AI_002');
  });

  test('should converge concurrent duplicate client-UUID submissions on one row with no double quota consumption', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'ai-dedupe', onboard: true });
    const accountId = persona.account!.id;
    const taskId = crypto.randomUUID();
    const csrfHeaders = await memoirCsrfHeaders(persona.ctx);

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => persona.ctx.post('/api/v1/ai/tasks', { headers: csrfHeaders, data: { id: taskId, queryText: 'racing dedupe question' } })),
    );
    for (const response of responses) expect(response.status(), await response.text()).toBe(201);
    const ids = new Set((await Promise.all(responses.map(async response => (await response.json()) as AiTaskView))).map(body => body.id));
    expect(ids, 'every racing response must resolve to the same converged row').toEqual(new Set([taskId]));

    const rows = await memoirDb()<{ quotaConsumed: boolean }[]>`SELECT quota_consumed AS "quotaConsumed" FROM ai_tasks WHERE account_id = ${accountId} AND id = ${taskId}`;
    expect(rows, 'exactly one row exists for the deduped id').toHaveLength(1);
    expect(rows[0]?.quotaConsumed, 'quota was consumed exactly once, not once per racing request').toBe(true);
  });

  test('should refund quota when cancelling a pending task, and 404 AI_003 for an unknown id', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'ai-cancel', onboard: true });

    const created = await submitAiTask(persona.ctx, 'question to cancel');
    expect(created.status(), await created.text()).toBe(201);
    const { id } = (await created.json()) as AiTaskView;

    const [beforeCancel] = await memoirDb()<{ quotaConsumed: boolean }[]>`SELECT quota_consumed AS "quotaConsumed" FROM ai_tasks WHERE id = ${id}`;
    expect(beforeCancel?.quotaConsumed, 'the submission consumed quota').toBe(true);

    const cancelled = await cancelAiTask(persona.ctx, id);
    if (cancelled.status() === 200) {
      expect(((await cancelled.json()) as AiTaskView).status).toBe('cancelled');
      const [afterCancel] = await memoirDb()<{ quotaConsumed: boolean }[]>`SELECT quota_consumed AS "quotaConsumed" FROM ai_tasks WHERE id = ${id}`;
      expect(afterCancel?.quotaConsumed, 'cancelling a still-pending task refunds the quota it consumed').toBe(false);
    } else {
      await expectRefusal(cancelled, 409, 'AI_004');
    }

    const unknown = await cancelAiTask(persona.ctx, crypto.randomUUID());
    await expectRefusal(unknown, 404, 'AI_003');
  });

  test('should reject cancelling an already-claimed task with 409 AI_004', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'ai-cancel-claimed', onboard: true });
    const accountId = persona.account!.id;
    const taskId = crypto.randomUUID();

    await memoirDb()`
      INSERT INTO ai_tasks (id, account_id, query_text, status, kind, expected_by, quota_month, quota_consumed, claimed_by, claimed_at)
      VALUES (${taskId}, ${accountId}, 'already claimed by the worker', 'running', 'adhoc', now() + interval '1 day', to_char(now(), 'YYYY-MM'), true, 'e2e-seeded-worker', now())
    `;

    const cancel = await cancelAiTask(persona.ctx, taskId);
    await expectRefusal(cancel, 409, 'AI_004');
  });

  test('should record a first consent decision once, refuse a second with 409 AI_011, refuse an incomplete first decision with 400 AI_012, and reflect withdrawal on the next read', async ({
    memoir,
  }) => {
    const persona = await memoir.persona({ label: 'ai-consent', onboard: true });

    const baseline = await getConsents(persona.ctx);
    expect(baseline.map(consent => consent.dataClass).sort()).toEqual(['health', 'journal_reflection_reason']);
    for (const consent of baseline) expect(consent.granted, `${consent.dataClass} must default ungranted`).toBe(false);

    const incomplete = await memoirMutate(persona.ctx, 'put', '/api/v1/ai/consents', {
      data: { grants: [{ dataClass: 'journal_reflection_reason', granted: true }], onlyIfUndecided: true },
    });
    await expectRefusal(incomplete, 400, 'AI_012');

    const firstDecision = await memoirMutate(persona.ctx, 'put', '/api/v1/ai/consents', {
      data: {
        grants: [
          { dataClass: 'journal_reflection_reason', granted: true },
          { dataClass: 'health', granted: false },
        ],
        onlyIfUndecided: true,
      },
    });
    expect(firstDecision.status(), await firstDecision.text()).toBe(200);

    const secondAttempt = await memoirMutate(persona.ctx, 'put', '/api/v1/ai/consents', {
      data: {
        grants: [
          { dataClass: 'journal_reflection_reason', granted: true },
          { dataClass: 'health', granted: true },
        ],
        onlyIfUndecided: true,
      },
    });
    await expectRefusal(secondAttempt, 409, 'AI_011');

    const withdrawal = await memoirMutate(persona.ctx, 'put', '/api/v1/ai/consents', { data: { grants: [{ dataClass: 'journal_reflection_reason', granted: false }] } });
    expect(withdrawal.status(), await withdrawal.text()).toBe(200);

    const after = await getConsents(persona.ctx);
    const journal = after.find(consent => consent.dataClass === 'journal_reflection_reason');
    expect(journal, 'the withdrawal must be reflected on the very next read').toMatchObject({ granted: false });
    expect(journal?.withdrawnAt, 'a withdrawn class carries a withdrawnAt timestamp').toBeTruthy();
  });

  test('should reject a free-tier scheduled query with 402 AI_005, and reject applying a suggestion on a nonexistent result with 404 AI_006', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'ai-free-tier-gates', onboard: true });

    const scheduledQuery = await memoirMutate(persona.ctx, 'put', '/api/v1/ai/scheduled-query', { data: { queryText: 'summarize my week', active: true } });
    await expectRefusal(scheduledQuery, 402, 'AI_005');

    /** There is no `GET /ai/results/{id}`; `AI_006` (result not found) is thrown by `POST /results/:id/apply`, so the not-found guarantee is proven through that route. */
    const applyMissing = await memoirMutate(persona.ctx, 'post', '/api/v1/ai/results/999999999999/apply', { data: { suggestionIndex: 0 } });
    await expectRefusal(applyMissing, 404, 'AI_006');
  });

  test('should apply a suggestion idempotently and reject an out-of-bounds suggestion index with 400 AI_007', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'ai-apply-suggestion', onboard: true });
    const accountId = persona.account!.id;
    const { questId } = await createDailyQuest(persona.ctx, 'ai-suggested-quest');
    const sql = memoirDb();

    const taskId = crypto.randomUUID();
    await sql`
      INSERT INTO ai_tasks (id, account_id, query_text, status, kind, expected_by, quota_month, quota_consumed)
      VALUES (${taskId}, ${accountId}, 'seeded task backing a fake result', 'done', 'adhoc', now() + interval '1 day', NULL, false)
    `;
    const [resultRow] = await sql<{ id: string }[]>`
      INSERT INTO ai_results (account_id, task_id, answer, suggestions, model_id, prompt_version)
      VALUES (${accountId}, ${taskId}, 'seeded answer text', ${sql.json([{ questId }, { questId }])}, 'e2e-seeded-model', 'v1')
      RETURNING id::text
    `;
    if (!resultRow) throw new Error('ai_results insert returned no row');
    const resultId = resultRow.id;

    const applied = await memoirMutate(persona.ctx, 'post', `/api/v1/ai/results/${resultId}/apply`, { data: { suggestionIndex: 0 } });
    expect(applied.status(), await applied.text()).toBe(200);
    const appliedBody = (await applied.json()) as { id: string; resultId: string; suggestionIndex: number; questId: string; appliedAt: string };
    expect(appliedBody).toMatchObject({ resultId, suggestionIndex: 0, questId });

    const repeated = await memoirMutate(persona.ctx, 'post', `/api/v1/ai/results/${resultId}/apply`, { data: { suggestionIndex: 0 } });
    expect(repeated.status(), await repeated.text()).toBe(200);
    const repeatedBody = (await repeated.json()) as { id: string; appliedAt: string };
    expect(repeatedBody, 'a replayed apply returns the row the first call already wrote, not a second one').toMatchObject({ id: appliedBody.id, appliedAt: appliedBody.appliedAt });

    const rows = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM applied_suggestions WHERE result_id = ${resultId} AND suggestion_index = 0`;
    expect(rows[0]?.count, 'the replay wrote no second row').toBe(1);

    const outOfBounds = await memoirMutate(persona.ctx, 'post', `/api/v1/ai/results/${resultId}/apply`, { data: { suggestionIndex: 5 } });
    await expectRefusal(outOfBounds, 400, 'AI_007');
  });
});
