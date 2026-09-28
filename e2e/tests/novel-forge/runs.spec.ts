/**
 * Importing npm packages
 */
import { randomUUID } from 'node:crypto';

import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { mutate } from '../../lib';
import { expect, type ForgeActor, test } from './forge-actors';
import { expectCode } from './forge-arrange';
import { insertContextPack, insertModelCalls, insertToolCall, insertWorkflowRun, readWorkflowRun } from './forge-db';
import { uniqueSuffix } from './forge-helpers';

/**
 * Defining types
 */

interface SeededProject {
  readonly projectId: string;
  /** A finished chapter run with two model calls, a tool call and a context pack. */
  readonly packed: string;
  readonly callIds: string[];
  /** A finished run with no context pack. */
  readonly bare: string;
  /** A run the database says is running, which no replica is executing. */
  readonly orphan: string;
  /** A background chat-title run, never shown to the author. */
  readonly background: string;
}

interface RunDetail {
  readonly id: string;
  readonly graph: string;
  readonly modelCalls: { id: string; role: string }[];
  readonly toolCalls: { tool: string }[];
  readonly contextPack?: { purpose: string; sections: Record<string, unknown>[] };
  readonly totals: { calls: number; inputTokens: number; outputTokens: number; costUsd: number };
}

/**
 * Declaring the constants
 *
 * Workflow-run inspection. The run list and each run's usage are the author's; a run's detail, its context pack and a model call's raw
 * output sit behind `novel-forge:admin`, evaluated in the organisation the caller acts in, and still behind the project ownership guard:
 * a personal project has no organisation, so an admin of their own personal organisation reading a stranger's runs would be cross-tenant.
 * Runs, calls and packs are seeded rows, so nothing here waits on a model.
 */

const RAW_OUTPUT = 'e2e-raw-model-output-marker';

const SECTION_TEXT = 'e2e-context-section-body-marker';

async function seedRuns(owner: ForgeActor): Promise<SeededProject> {
  const created = await mutate(owner.ctx, 'post', '/api/v1/projects', { data: { name: `e2e-forge-runs-${uniqueSuffix()}`, kind: 'new_novel' } });
  expect(created.status(), await created.text()).toBe(201);
  const projectId = ((await created.json()) as { id: string }).id;

  const packId = await insertContextPack({
    projectId,
    purpose: 'generation',
    chapter: 1,
    sections: [
      { key: 'story', tier: 'stable', segment: 'stable', tokens: 120, truncated: false, text: SECTION_TEXT },
      { key: 'recent-chapters', tier: 'volatile', segment: 'volatile', tokens: 400, truncated: true, text: SECTION_TEXT },
    ],
    rendered: `## Story\n${SECTION_TEXT}`,
  });
  const packed = await insertWorkflowRun({
    projectId,
    graph: 'chapter-generation',
    target: 'chapter:1',
    status: 'completed',
    outcome: 'drafted',
    contextPackId: packId,
    startedAgoMs: 60_000,
    endedAgoMs: 30_000,
  });
  const callIds = await insertModelCalls([
    { projectId, runId: packed, role: 'generation', inputTokens: 1_000, outputTokens: 500, costUsd: 0.25, costSource: 'provider', rawOutput: RAW_OUTPUT, chapter: 1 },
    { projectId, runId: packed, role: 'judge', inputTokens: 300, outputTokens: 50, costUsd: 0.05, costSource: 'provider', rawOutput: RAW_OUTPUT, chapter: 1 },
  ]);
  await insertToolCall({ runId: packed, modelCallId: callIds[0], tool: 'lookup_entity' });

  const bare = await insertWorkflowRun({ projectId, graph: 'novel-validation', status: 'completed', startedAgoMs: 20_000, endedAgoMs: 10_000 });
  const orphan = await insertWorkflowRun({ projectId, graph: 'chapter-generation', target: 'chapter:2', status: 'running', startedAgoMs: 5_000 });
  const background = await insertWorkflowRun({ projectId, graph: 'chat-title', status: 'running', startedAgoMs: 1_000 });
  return { projectId, packed, callIds, bare, orphan, background };
}

async function expectMissing(response: APIResponse, what: string): Promise<void> {
  expect(response.status(), `${what} — body ${await response.text()}`).toBe(404);
}

function runPath(seeded: SeededProject, runId: string, suffix = ''): string {
  return `/api/v1/projects/${seeded.projectId}/runs/${runId}${suffix}`;
}

async function listRunIds(ctx: APIRequestContext, seeded: SeededProject, query = ''): Promise<string[]> {
  const response = await ctx.get(`/api/v1/projects/${seeded.projectId}/runs${query}`);
  expect(response.status(), await response.text()).toBe(200);
  return ((await response.json()) as { items: { id: string }[] }).items.map(item => item.id);
}

test.describe('novel-forge run inspection', () => {
  test('should show an admin a run with its calls, tools and pack anatomy, and the pack and raw output only on their own routes', async ({ forge }) => {
    const admin = await forge.actor({ label: 'runs-admin', roles: ['NovelForgeAdmin'] });
    const seeded = await seedRuns(admin);

    const detail = await admin.ctx.get(runPath(seeded, seeded.packed));
    expect(detail.status(), await detail.text()).toBe(200);
    const text = await detail.text();
    const run = JSON.parse(text) as RunDetail;
    expect(run.graph).toBe('chapter-generation');
    expect(run.modelCalls.map(call => call.id).sort()).toEqual([...seeded.callIds].sort());
    expect(run.toolCalls.map(call => call.tool)).toEqual(['lookup_entity']);
    expect(run.totals).toMatchObject({ calls: 2, inputTokens: 1_300, outputTokens: 550 });
    expect(run.totals.costUsd).toBeCloseTo(0.3, 6);
    expect(run.contextPack?.purpose).toBe('generation');
    expect(run.contextPack?.sections).toEqual([
      expect.objectContaining({ key: 'story', tokens: 120, truncated: false }),
      expect.objectContaining({ key: 'recent-chapters', tokens: 400, truncated: true }),
    ]);
    expect(text, 'the run summary carries neither section text nor raw model output').not.toContain(SECTION_TEXT);
    expect(text).not.toContain(RAW_OUTPUT);

    const context = await admin.ctx.get(runPath(seeded, seeded.packed, '/context'));
    expect(context.status(), await context.text()).toBe(200);
    expect(((await context.json()) as { rendered: string }).rendered).toContain(SECTION_TEXT);

    const call = await admin.ctx.get(runPath(seeded, seeded.packed, `/calls/${seeded.callIds[0]}`));
    expect(call.status(), await call.text()).toBe(200);
    expect(((await call.json()) as { rawOutput: string }).rawOutput).toBe(RAW_OUTPUT);
  });

  test('should report a run with no pack as packless and unknown runs and calls as not found', async ({ forge }) => {
    const admin = await forge.actor({ label: 'runs-missing', roles: ['NovelForgeAdmin'] });
    const seeded = await seedRuns(admin);

    const bare = await admin.ctx.get(runPath(seeded, seeded.bare));
    expect(bare.status(), await bare.text()).toBe(200);
    const body = (await bare.json()) as RunDetail;
    expect(body.contextPack, 'an unlinked pack is omitted, never null').toBeUndefined();
    expect(body.toolCalls).toEqual([]);
    await expectCode(await admin.ctx.get(runPath(seeded, seeded.bare, '/context')), 404, 'CTX_001', 'the context of a run with no pack');

    await expectMissing(await admin.ctx.get(runPath(seeded, randomUUID())), 'an unknown run');
    await expectMissing(await admin.ctx.get(runPath(seeded, seeded.packed, '/calls/999999999')), 'an unknown call on a real run');
    await expectMissing(await admin.ctx.get(runPath(seeded, seeded.bare, `/calls/${seeded.callIds[0]}`)), "another run's call");
  });

  test("should gate a run's detail on the admin permission even for its owner, and keep an admin out of other owners' runs", async ({ forge }) => {
    const owner = await forge.actor({ label: 'runs-owner' });
    const admin = await forge.actor({ label: 'runs-other-admin', roles: ['NovelForgeAdmin'] });
    const seeded = await seedRuns(owner);

    for (const suffix of ['', '/context', `/calls/${seeded.callIds[0]}`]) {
      await expectCode(await owner.ctx.get(runPath(seeded, seeded.packed, suffix)), 403, 'IAM_002', `the owner without novel-forge:admin on run${suffix || ' detail'}`);
      await expectCode(await admin.ctx.get(runPath(seeded, seeded.packed, suffix)), 404, 'PRJ_001', `an admin on another owner's run${suffix || ' detail'}`);
    }

    expect(await listRunIds(owner.ctx, seeded), 'the owner still lists their runs').toContain(seeded.packed);
    const usage = await owner.ctx.get(runPath(seeded, seeded.packed, '/usage'));
    expect(usage.status(), `and reads a run's usage — body ${await usage.text()}`).toBe(200);
    const usageText = await usage.text();
    expect(usageText, "the author's usage projection carries no raw output").not.toContain(RAW_OUTPUT);
    const totals = (JSON.parse(usageText) as { totals: RunDetail['totals']; calls: unknown[] }).totals;
    expect(totals).toMatchObject({ calls: 2, inputTokens: 1_300, outputTokens: 550 });
    expect(totals.costUsd).toBeCloseTo(0.3, 6);
  });

  test('should list only author-facing runs and refuse an inverted date range', async ({ forge }) => {
    const owner = await forge.actor({ label: 'runs-list' });
    const seeded = await seedRuns(owner);

    const listed = await listRunIds(owner.ctx, seeded);
    expect(listed.sort()).toEqual([seeded.packed, seeded.bare, seeded.orphan].sort());
    expect(listed, 'a background chat-title run never surfaces').not.toContain(seeded.background);
    expect(await listRunIds(owner.ctx, seeded, '?graph=novel-validation')).toEqual([seeded.bare]);

    const background = await owner.ctx.get(`/api/v1/projects/${seeded.projectId}/runs?graph=chat-title`);
    expect(background.status(), 'a background graph is not a filter value').toBe(422);

    const inverted = await owner.ctx.get(
      `/api/v1/projects/${seeded.projectId}/runs?from=${encodeURIComponent('2026-02-01T00:00:00Z')}&to=${encodeURIComponent('2026-01-01T00:00:00Z')}`,
    );
    await expectCode(inverted, 400, 'AI_014', 'from after to');
  });

  test('should report cancelling a settled or undeliverable run without touching it', async ({ forge }) => {
    const owner = await forge.actor({ label: 'runs-cancel' });
    const seeded = await seedRuns(owner);

    await expectMissing(await mutate(owner.ctx, 'post', runPath(seeded, randomUUID(), '/cancel')), 'cancelling an unknown run');

    const settled = await mutate(owner.ctx, 'post', runPath(seeded, seeded.packed, '/cancel'));
    expect(settled.status(), await settled.text()).toBe(200);
    expect(await settled.json()).toEqual({ runId: seeded.packed, status: 'completed', outcome: 'already_settled' });
    expect(await readWorkflowRun(seeded.packed)).toMatchObject({ status: 'completed', outcome: 'drafted' });

    const orphan = await mutate(owner.ctx, 'post', runPath(seeded, seeded.orphan, '/cancel'));
    expect(orphan.status(), await orphan.text()).toBe(200);
    expect(await orphan.json(), 'no replica holds the run, so the abort cannot be delivered').toEqual({ runId: seeded.orphan, status: 'running', outcome: 'not_delivered' });
    expect(await readWorkflowRun(seeded.orphan)).toMatchObject({ status: 'running', endedAt: null });
  });
});
