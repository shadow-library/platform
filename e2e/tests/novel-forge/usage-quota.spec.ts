/**
 * Importing npm packages
 */
import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { mutate } from '../../lib';
import { expect, type ForgeActor, test } from './forge-actors';
import {
  assertSpendGuarded,
  failPin,
  insertModelCallBatch,
  insertModelCalls,
  listDispatchedModelCalls,
  listModelCallModels,
  readAccountDefaultCostTier,
  readProjectRow,
} from './forge-db';
import { errorCode, uniqueSuffix } from './forge-helpers';

/**
 * Defining types
 */

interface Quota {
  readonly calls: number;
  readonly costUsd: number;
  readonly maxCalls: number;
  readonly maxCostUsd: number;
  readonly windowMs: number;
  readonly resetsAt: string | null;
}

interface RegistryModel {
  readonly id: string;
  readonly provider: string;
  readonly label: string;
  readonly kind: string;
  readonly inputPricePerMToken?: number;
  readonly outputPricePerMToken?: number;
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
 * Declaring the constants
 *
 * Spend control and the figures behind it. The AI quota is a rolling window per owner over `model_calls`, enforced before the router
 * resolves a model — so on a fail-pinned project a request that passes the quota is refused AI_002 and one that breaches it is refused
 * AI_008/AI_009, and nothing is ever dispatched. Cost figures are asserted over seeded calls whose prices this spec controls; the one
 * list-price estimate is computed from the registry `GET /ai/models` serves.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Not in the registry, so its calls are labelled by id and never estimated. */
const UNKNOWN_MODEL = 'e2e/unknown-model';

async function createProject(owner: ForgeActor, data: Record<string, unknown> = {}): Promise<ProjectBody> {
  const response = await mutate(owner.ctx, 'post', '/api/v1/projects', {
    data: { name: `e2e-forge-spend-${uniqueSuffix()}`, kind: 'new_novel', contentMode: 'standard', ...data },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as ProjectBody;
}

async function pinnedProject(owner: ForgeActor): Promise<string> {
  const { id } = await createProject(owner);
  await failPin(id);
  return id;
}

async function enhancePremise(owner: ForgeActor, projectId: string): Promise<APIResponse> {
  await assertSpendGuarded(projectId);
  return mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/premise/enhance`, { data: { overview: 'A cartographer maps a district that moves every night.' } });
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

async function pricedModel(ctx: APIRequestContext): Promise<RegistryModel & { inputPricePerMToken: number }> {
  const response = await ctx.get('/api/v1/ai/models');
  expect(response.status(), await response.text()).toBe(200);
  const models = ((await response.json()) as { models: RegistryModel[] }).models;
  const priced = models.find(model => model.kind === 'llm' && (model.inputPricePerMToken ?? 0) > 0);
  expect(priced, 'the registry lists a priced text model').toBeDefined();
  return priced as RegistryModel & { inputPricePerMToken: number };
}

function item(items: BreakdownItem[], key: string): BreakdownItem | undefined {
  return items.find(entry => entry.key === key);
}

test.describe('novel-forge AI quota', () => {
  test('should pass the quota one call below the rate ceiling and refuse at it without dispatching', async ({ forge }) => {
    const author = await forge.actor({ label: 'quota-rate' });
    const projectId = await pinnedProject(author);
    const limits = await readQuota(author.ctx);
    expect(limits.maxCalls, 'the rate dimension is enabled').toBeGreaterThan(0);

    await insertModelCallBatch(limits.maxCalls - 1, { projectId, costUsd: 0, costSource: 'provider' });
    await expectOutcome(await enhancePremise(author, projectId), 400, 'AI_002', 'one call below the ceiling, the quota passes and the fail-pin refuses');

    await insertModelCallBatch(1, { projectId, costUsd: 0, costSource: 'provider' });
    await expectOutcome(await enhancePremise(author, projectId), 429, 'AI_008', 'at the ceiling the next dispatch is the one over the line');

    const quota = await readQuota(author.ctx);
    expect(quota).toMatchObject({ calls: limits.maxCalls, costUsd: 0, maxCalls: limits.maxCalls, maxCostUsd: limits.maxCostUsd, windowMs: limits.windowMs });
    const resetsIn = Date.parse(quota.resetsAt ?? '') - Date.now();
    expect(resetsIn, 'the window frees capacity one window after its oldest call').toBeGreaterThan(limits.windowMs - 120_000);
    expect(resetsIn).toBeLessThanOrEqual(limits.windowMs);
    expect((await listModelCallModels(projectId)).length, 'neither request dispatched a model call').toBe(limits.maxCalls);
  });

  test('should price recorded and token-only calls into the spend ceiling and report a rate breach first', async ({ forge }) => {
    const author = await forge.actor({ label: 'quota-spend' });
    const projectId = await pinnedProject(author);
    const limits = await readQuota(author.ctx);
    expect(limits.maxCostUsd, 'the spend dimension is enabled').toBeGreaterThan(0);
    const model = await pricedModel(author.ctx);
    const estimated = model.inputPricePerMToken;
    expect(estimated, 'one estimated call stays under the ceiling').toBeLessThan(limits.maxCostUsd);

    await insertModelCalls([
      { projectId, model: model.id, inputTokens: 1_000_000, outputTokens: 0, costUsd: null, costSource: null },
      { projectId, model: model.id, costUsd: limits.maxCostUsd - estimated - 0.01, costSource: 'provider' },
    ]);
    expect((await readQuota(author.ctx)).costUsd).toBeCloseTo(limits.maxCostUsd - 0.01, 6);
    await expectOutcome(await enhancePremise(author, projectId), 400, 'AI_002', 'a cent under the spend ceiling');

    await insertModelCalls([{ projectId, model: model.id, costUsd: 0.02, costSource: 'provider' }]);
    await expectOutcome(await enhancePremise(author, projectId), 429, 'AI_009', 'past the spend ceiling, counting the token-only estimate');

    await insertModelCallBatch(limits.maxCalls, { projectId, costUsd: 0, costSource: 'provider' });
    await expectOutcome(await enhancePremise(author, projectId), 429, 'AI_008', 'with both ceilings breached the rate breach is reported');
    expect((await listModelCallModels(projectId)).length).toBe(limits.maxCalls + 3);
  });

  test('should refuse a quota-pinned project before routing, so no model is ever resolved', async ({ forge }) => {
    const author = await forge.actor({ label: 'quota-pin' });
    const projectId = await pinnedProject(author);
    await forge.quotaPin(projectId);

    await assertSpendGuarded(projectId, { requireQuota: true });
    await expectOutcome(await enhancePremise(author, projectId), 429, 'AI_008', 'the quota pin answers before the router looks at the fail-pin');
    expect(await listDispatchedModelCalls(projectId), 'nothing was dispatched').toEqual([]);
  });

  test("should count only the owner's own calls inside the window", async ({ forge }) => {
    const author = await forge.actor({ label: 'quota-own' });
    const neighbour = await forge.actor({ label: 'quota-neighbour' });
    const projectId = await pinnedProject(author);
    const neighbourProject = await pinnedProject(neighbour);
    const limits = await readQuota(author.ctx);

    await insertModelCallBatch(limits.maxCalls, { projectId: neighbourProject, costUsd: limits.maxCostUsd, costSource: 'provider' });
    await insertModelCallBatch(limits.maxCalls, { projectId, costUsd: limits.maxCostUsd, costSource: 'provider', ageMs: limits.windowMs + 60_000 });

    await expectOutcome(await enhancePremise(author, projectId), 400, 'AI_002', "another owner's calls and this owner's expired ones do not count");
    expect(await readQuota(author.ctx)).toMatchObject({ calls: 0, costUsd: 0, resetsAt: null });
    await expectOutcome(await enhancePremise(neighbour, neighbourProject), 429, 'AI_008', 'the neighbour is at its own ceiling');
  });
});

test.describe('novel-forge cost figures', () => {
  test('should group, bucket and price a project’s calls and keep another project’s out', async ({ forge }) => {
    const author = await forge.actor({ label: 'cost' });
    const project = await createProject(author);
    const other = await createProject(author);
    const model = await pricedModel(author.ctx);
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

  test('should report a project with no calls as all zero', async ({ forge }) => {
    const author = await forge.actor({ label: 'cost-empty' });
    const project = await createProject(author);

    const cost = await readCost(author.ctx, `/api/v1/projects/${project.id}/cost`);
    expect(cost).toMatchObject({ totalCostUsd: 0, estimatedCostUsd: 0, last7DaysCostUsd: 0, last30DaysCostUsd: 0, calls: 0, inputTokens: 0, outputTokens: 0 });
    for (const breakdown of [cost.byGroup, cost.byRole, cost.byModel, cost.byCostSource, cost.byTier, cost.byContentMode, cost.byDay]) expect(breakdown).toEqual([]);
  });
});

test.describe('novel-forge AI settings and project models', () => {
  test('should default a new account to Balanced and start new projects on the saved default tier', async ({ forge }) => {
    const author = await forge.actor({ label: 'settings' });

    const initial = await author.ctx.get('/api/v1/ai/settings');
    expect(initial.status(), await initial.text()).toBe(200);
    expect(await initial.json()).toEqual({ defaultCostTier: 'balanced' });

    const invalid = await mutate(author.ctx, 'put', '/api/v1/ai/settings', { data: { defaultCostTier: 'luxury' } });
    expect(invalid.status(), `an unknown tier — body ${await invalid.text()}`).toBe(422);
    expect(await errorCode(invalid)).toBe('VALIDATION_ERROR');

    const saved = await mutate(author.ctx, 'put', '/api/v1/ai/settings', { data: { defaultCostTier: 'economy' } });
    expect(saved.status(), await saved.text()).toBe(200);
    expect(await saved.json()).toEqual({ defaultCostTier: 'economy' });
    expect(await (await author.ctx.get('/api/v1/ai/settings')).json()).toEqual({ defaultCostTier: 'economy' });
    expect(await readAccountDefaultCostTier(author.owner)).toBe('economy');

    expect((await createProject(author)).costTier, 'a project created without a tier takes the saved default').toBe('economy');
    const performant = await createProject(author, { costTier: 'performant' });
    expect(performant.costTier, 'a tier named on creation wins').toBe('performant');

    const clone = await mutate(author.ctx, 'post', `/api/v1/projects/${performant.id}/clone`, { data: { name: `e2e-forge-clone-${uniqueSuffix()}` } });
    expect(clone.status(), await clone.text()).toBe(201);
    expect(((await clone.json()) as ProjectBody).costTier, "a clone keeps its source's tier over the account default").toBe('performant');
  });

  test('should refuse a project model pin outside the registry or on the wrong provider', async ({ forge }) => {
    const author = await forge.actor({ label: 'models' });
    const project = await createProject(author);
    const model = await pricedModel(author.ctx);
    const patch = (ref: { provider: string; model: string }): Promise<APIResponse> =>
      mutate(author.ctx, 'patch', `/api/v1/projects/${project.id}`, { data: { config: { models: { generation: ref } } } });

    await expectOutcome(await patch({ provider: 'openrouter', model: 'nope/nope' }), 400, 'AI_002', 'an id the registry does not carry');
    await expectOutcome(await patch({ provider: 'anthropic', model: model.id }), 400, 'AI_002', 'a registered id on a provider it is not served by');

    const pinned = await patch({ provider: model.provider, model: model.id });
    expect(pinned.status(), `a registered model on its own provider is accepted — body ${await pinned.text()}`).toBe(200);
  });

  // project.service.ts:223 binds JSON.stringify(config) as a jsonb string, so `|| kept` stores ["{…}", {}] and the pin is lost.
  test.fixme('should keep a project model pin it accepted', async ({ forge }) => {
    const author = await forge.actor({ label: 'models-kept' });
    const project = await createProject(author);
    const model = await pricedModel(author.ctx);
    const ref = { provider: model.provider, model: model.id };

    const pinned = await mutate(author.ctx, 'patch', `/api/v1/projects/${project.id}`, { data: { config: { models: { generation: ref } } } });
    expect(pinned.status(), await pinned.text()).toBe(200);
    expect(((await pinned.json()) as { config?: { models?: Record<string, unknown> } }).config?.models?.generation).toEqual(ref);
    expect((await readProjectRow(project.id))?.config?.models?.generation, 'the router reads the pin from the stored config').toEqual(ref);
  });

  // defaults.ts:114 isRegisteredModel checks only the provider, so project.service.ts:80 accepts an image model on a text role.
  test.fixme('should refuse an image model pinned on a text role', async ({ forge }) => {
    const author = await forge.actor({ label: 'models-image' });
    const project = await createProject(author);
    const response = await author.ctx.get('/api/v1/ai/models');
    const image = ((await response.json()) as { models: RegistryModel[] }).models.find(model => model.kind === 'image');
    expect(image, 'the registry lists an image model').toBeDefined();
    if (!image) return;

    const pinned = await mutate(author.ctx, 'patch', `/api/v1/projects/${project.id}`, {
      data: { config: { models: { generation: { provider: image.provider, model: image.id } } } },
    });
    await expectOutcome(pinned, 400, 'AI_002', 'an image model cannot write prose');
  });
});
