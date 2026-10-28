import { type APIRequestContext, type APIResponse } from '@playwright/test';

import { mutate } from '../../lib';
import { expect, type ForgeActor, test } from './forge-actors';
import { assertSpendGuarded, insertModelCallBatch, insertModelCalls, listDispatchedModelCalls } from './forge-db';
import { errorCode, uniqueSuffix } from './forge-helpers';

interface Quota {
  readonly calls: number;
  readonly costUsd: number;
  readonly maxCalls: number;
  readonly maxCostUsd: number;
  readonly windowMs: number;
  readonly resetsAt: string | null;
}

interface BreakdownItem {
  readonly key: string;
  readonly label: string;
  readonly calls: number;
  readonly costUsd: number;
  readonly estimatedCostUsd: number;
}

interface Cost {
  readonly totalCostUsd: number;
  readonly estimatedCostUsd: number;
  readonly last7DaysCostUsd: number;
  readonly last30DaysCostUsd: number;
  readonly calls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly byGroup: BreakdownItem[];
  readonly byRole: BreakdownItem[];
  readonly byModel: BreakdownItem[];
  readonly byCostSource: BreakdownItem[];
  readonly byTier: BreakdownItem[];
  readonly byContentMode: BreakdownItem[];
  readonly byDay: { day: string; calls: number; costUsd: number }[];
}

interface ProjectBody {
  readonly id: string;
  readonly costTier: string;
}

/**
 * The AI quota is a rolling window per owner over `model_calls`, reported by `GET /ai/quota` and enforced by nothing in novel-forge (spend limits are Synapse budgets, which the
 * quota pin stands at their cap). A request is sent only once the owner is pinned; otherwise the quota's report is asserted. Cost figures use seeded calls with controlled
 * prices; the one list-price estimate comes from the historical price of a pre-Synapse slug.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const HISTORICAL_MODEL = { id: 'anthropic/claude-sonnet-5', label: 'Claude Sonnet 5', inputPricePerMToken: 2 };

const UNKNOWN_MODEL = 'e2e/unknown-model';

async function createProject(owner: ForgeActor, data: Record<string, unknown> = {}): Promise<ProjectBody> {
  const response = await mutate(owner.ctx, 'post', '/api/v1/projects', {
    data: { name: `e2e-forge-spend-${uniqueSuffix()}`, kind: 'new_novel', contentMode: 'standard', ...data },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as ProjectBody;
}

async function newProjectId(owner: ForgeActor): Promise<string> {
  return (await createProject(owner)).id;
}

function postEnhancePremise(owner: ForgeActor, projectId: string): Promise<APIResponse> {
  return mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/premise/enhance`, { data: { overview: 'A cartographer maps a district that moves every night.' } });
}

async function enhancePremise(owner: ForgeActor, projectId: string): Promise<APIResponse> {
  await assertSpendGuarded(projectId);
  return postEnhancePremise(owner, projectId);
}

async function expectOutcome(response: APIResponse, status: number, code: string, what: string): Promise<void> {
  expect(response.status(), `${what} — body ${await response.text()}`).toBe(status);
  expect(await errorCode(response), what).toBe(code);
}

async function readQuota(ctx: APIRequestContext): Promise<Quota> {
  const response = await ctx.get('/api/v1/ai/quota');
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as Quota;
}

async function readCost(ctx: APIRequestContext, path: string): Promise<Cost> {
  const response = await ctx.get(path);
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as Cost;
}

function item(items: BreakdownItem[], key: string): BreakdownItem | undefined {
  return items.find(entry => entry.key === key);
}

test.describe('novel-forge AI quota', () => {
  test('should refuse a quota-pinned project before routing, so no model is ever resolved', async ({ forge }) => {
    const author = await forge.actor({ label: 'quota-pin' });
    const projectId = await newProjectId(author);
    await forge.quotaPin(projectId);

    await expectOutcome(await enhancePremise(author, projectId), 429, 'AI_008', 'the quota pin answers before the router resolves a model');
    expect(await listDispatchedModelCalls(projectId), 'nothing was dispatched').toEqual([]);
  });

  test("should count only the owner's own calls inside the window", async ({ forge }) => {
    const author = await forge.actor({ label: 'quota-own' });
    const neighbour = await forge.actor({ label: 'quota-neighbour' });
    const projectId = await newProjectId(author);
    const neighbourProject = await newProjectId(neighbour);
    const limits = await readQuota(author.ctx);

    await insertModelCallBatch(limits.maxCalls, { projectId: neighbourProject, costUsd: limits.maxCostUsd, costSource: 'provider' });
    await insertModelCallBatch(limits.maxCalls, { projectId, costUsd: limits.maxCostUsd, costSource: 'provider', ageMs: limits.windowMs + 60_000 });

    expect(await readQuota(author.ctx), "another owner's calls and this owner's expired ones do not count").toMatchObject({ calls: 0, costUsd: 0, resetsAt: null });
    expect((await readQuota(neighbour.ctx)).calls, 'the neighbour counts its own calls').toBe(limits.maxCalls);
  });
});

test.describe('novel-forge cost figures', () => {
  test('should group, bucket and price a project’s calls and keep another project’s out', async ({ forge }) => {
    const author = await forge.actor({ label: 'cost', roles: ['NovelForgeAdmin'] });
    const project = await createProject(author);
    const other = await createProject(author);
    const model = HISTORICAL_MODEL;
    const estimate = model.inputPricePerMToken;

    await insertModelCalls([
      {
        projectId: project.id,
        role: 'generation',
        model: model.id,
        inputTokens: 2_000,
        outputTokens: 1_000,
        costUsd: 1,
        costSource: 'provider',
        tier: 'economy',
        contentMode: 'standard',
        chapter: 1,
        ageMs: DAY_MS,
      },
      {
        projectId: project.id,
        role: 'bible:world',
        model: model.id,
        inputTokens: 500,
        outputTokens: 100,
        costUsd: 0.5,
        costSource: 'estimate',
        tier: 'balanced',
        contentMode: 'standard',
        ageMs: 10 * DAY_MS,
      },
      { projectId: project.id, role: 'judge', model: model.id, inputTokens: 1_000_000, outputTokens: 0, costUsd: null, costSource: null, ageMs: 40 * DAY_MS },
      {
        projectId: project.id,
        role: 'e2e-unroutable',
        model: UNKNOWN_MODEL,
        inputTokens: 5_000,
        outputTokens: 5_000,
        costUsd: null,
        costSource: null,
        chapter: 1,
        ageMs: 2 * DAY_MS,
      },
      {
        projectId: project.id,
        role: 'generation',
        model: model.id,
        status: 'transport_error',
        costUsd: null,
        costSource: null,
        tier: 'economy',
        contentMode: 'standard',
        ageMs: DAY_MS,
      },
      { projectId: other.id, role: 'generation', model: model.id, inputTokens: 9_000, outputTokens: 9_000, costUsd: 100, costSource: 'provider', ageMs: DAY_MS },
    ]);

    const cost = await readCost(author.ctx, `/api/v1/projects/${project.id}/cost`);
    expect(cost.calls, 'every call counts, the failed one included').toBe(5);
    expect(cost.totalCostUsd, "recorded costs, the legacy row's estimate, and nothing for the unknown model or the failed call").toBeCloseTo(1.5 + estimate, 6);
    expect(cost.estimatedCostUsd, 'the estimate-sourced row plus the legacy estimate').toBeCloseTo(0.5 + estimate, 6);
    expect(cost.last7DaysCostUsd).toBeCloseTo(1, 6);
    expect(cost.last30DaysCostUsd, 'a 40-day-old call is outside both windows but still in the total').toBeCloseTo(1.5, 6);

    expect(item(cost.byGroup, 'writing')).toMatchObject({ calls: 2 });
    expect(item(cost.byGroup, 'writing')?.costUsd).toBeCloseTo(1, 6);
    expect(item(cost.byGroup, 'planning')?.costUsd, 'a namespaced role belongs to its namespace group').toBeCloseTo(0.5, 6);
    expect(item(cost.byGroup, 'review')?.costUsd).toBeCloseTo(estimate, 6);
    expect(item(cost.byGroup, 'other'), 'an unroutable role falls to other').toMatchObject({ calls: 1, costUsd: 0 });
    for (const breakdown of [cost.byGroup, cost.byRole, cost.byModel]) {
      expect(
        breakdown.map(entry => entry.costUsd),
        'breakdowns sort highest spend first',
      ).toEqual([...breakdown.map(entry => entry.costUsd)].sort((a, b) => b - a));
    }

    expect(item(cost.byModel, model.id)).toMatchObject({ label: model.label, calls: 4 });
    expect(item(cost.byModel, UNKNOWN_MODEL), 'an unknown model is labelled by its id and never estimated').toMatchObject({
      label: UNKNOWN_MODEL,
      calls: 1,
      costUsd: 0,
      estimatedCostUsd: 0,
    });
    expect(item(cost.byCostSource, 'provider')?.costUsd).toBeCloseTo(1, 6);
    expect(item(cost.byCostSource, 'estimate')?.costUsd).toBeCloseTo(0.5, 6);
    expect(item(cost.byCostSource, 'unknown'), 'legacy rows with no source').toMatchObject({ calls: 2 });
    expect(item(cost.byCostSource, 'error'), 'a failed call keys apart from the legacy rows').toMatchObject({ calls: 1, costUsd: 0 });
    expect(item(cost.byTier, 'economy')).toMatchObject({ calls: 2 });
    expect(item(cost.byTier, 'unknown')).toMatchObject({ calls: 2 });
    expect(item(cost.byContentMode, 'standard')).toMatchObject({ calls: 3 });
    expect(item(cost.byContentMode, 'unknown')).toMatchObject({ calls: 2 });
    expect(
      cost.byDay.reduce((sum, day) => sum + day.calls, 0),
      'the daily series covers the last 30 days only',
    ).toBe(4);
    expect(cost.byDay.reduce((sum, day) => sum + day.costUsd, 0)).toBeCloseTo(1.5, 6);

    const chapter = await author.ctx.get(`/api/v1/projects/${project.id}/chapters/1/cost`);
    expect(chapter.status(), await chapter.text()).toBe(200);
    const chapterCost = (await chapter.json()) as { chapter: number; totals: { calls: number; costUsd: number }; byRole: { role: string; calls: number; costUsd: number }[] };
    expect(chapterCost.totals.calls).toBe(2);
    expect(chapterCost.totals.costUsd).toBeCloseTo(1, 6);
    expect(chapterCost.byRole.map(entry => entry.role)).toEqual(['generation', 'e2e-unroutable']);

    const account = await readCost(author.ctx, '/api/v1/ai/usage');
    const byProject = (account as Cost & { byProject: { projectId: string; calls: number; costUsd: number }[] }).byProject;
    expect(
      byProject.map(entry => entry.projectId),
      'the account breaks down by novel, highest spend first',
    ).toEqual([other.id, project.id]);
    expect(byProject[1]?.costUsd).toBeCloseTo(cost.totalCostUsd, 6);
    expect(account.totalCostUsd).toBeCloseTo(cost.totalCostUsd + 100, 6);
    expect(account.calls).toBe(6);
  });

  test('should show an author the spend but not which model it went to', async ({ forge }) => {
    const author = await forge.actor({ label: 'cost-author' });
    const project = await createProject(author);
    await insertModelCalls([
      { projectId: project.id, role: 'generation', model: HISTORICAL_MODEL.id, costUsd: 0.5, costSource: 'provider', tier: 'economy', contentMode: 'standard', ageMs: DAY_MS },
    ]);

    const cost = await readCost(author.ctx, `/api/v1/projects/${project.id}/cost`);
    expect(cost.totalCostUsd).toBeCloseTo(0.5, 6);
    expect(item(cost.byGroup, 'writing')?.costUsd).toBeCloseTo(0.5, 6);
    expect(cost.byModel, 'model identity is admin-only').toEqual([]);
    expect((await readCost(author.ctx, '/api/v1/ai/usage')).byModel).toEqual([]);
  });

  test('should report a project with no calls as all zero', async ({ forge }) => {
    const author = await forge.actor({ label: 'cost-empty' });
    const project = await createProject(author);

    const cost = await readCost(author.ctx, `/api/v1/projects/${project.id}/cost`);
    expect(cost).toMatchObject({ totalCostUsd: 0, estimatedCostUsd: 0, last7DaysCostUsd: 0, last30DaysCostUsd: 0, calls: 0, inputTokens: 0, outputTokens: 0 });
    for (const breakdown of [cost.byGroup, cost.byRole, cost.byModel, cost.byCostSource, cost.byTier, cost.byContentMode, cost.byDay]) expect(breakdown).toEqual([]);
  });
});

test.describe('novel-forge pace defaults', () => {
  test('should start a new project on balanced, on the tier its request names, and a clone on its source’s tier', async ({ forge }) => {
    const author = await forge.actor({ label: 'pace' });

    expect((await createProject(author)).costTier, 'a project created without a tier starts on balanced').toBe('balanced');
    const performant = await createProject(author, { costTier: 'performant' });
    expect(performant.costTier, 'a tier named on creation wins').toBe('performant');

    const clone = await mutate(author.ctx, 'post', `/api/v1/projects/${performant.id}/clone`, { data: { name: `e2e-forge-clone-${uniqueSuffix()}` } });
    expect(clone.status(), await clone.text()).toBe(201);
    expect(((await clone.json()) as ProjectBody).costTier, "a clone keeps its source's tier").toBe('performant');
  });
});
