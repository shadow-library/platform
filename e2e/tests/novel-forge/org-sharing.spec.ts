/**
 * Importing npm packages
 */
import { randomInt } from 'node:crypto';

import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { mutate } from '../../lib';
import { expect, test } from './forge-actors';
import { insertJob, insertProject, listProjectIdsOwnedBy, readProjectRow, updateProjectOwnership } from './forge-db';
import { errorCode, uniqueSuffix } from './forge-helpers';

/**
 * Defining types
 */

interface ProjectItem {
  readonly id: string;
  readonly ownerKind: 'user' | 'bot';
  readonly sharedWithOrg: boolean;
}

interface ProjectList {
  readonly items: ProjectItem[];
  readonly total: number;
}

/**
 * Declaring the constants
 *
 * Who reaches a project besides its owner. A bot's project may be shared with the bot's organisation, which opens it to that
 * organisation's curators (people holding `novel-forge:curate` there, acting in it) and to nobody else; everything else answers
 * 404 PRJ_001, indistinguishable from a project that does not exist. Ownership is the (kind, id) pair, never the id alone.
 * Also here: the surfaces the product retired, which must be gone rather than guarded.
 */

/** A bot id no identity bot carries; ownership never resolves it against identity. */
function strayBotId(): string {
  return String(randomInt(900_000_000, 999_999_999));
}

async function list(ctx: APIRequestContext): Promise<ProjectList> {
  const response = await ctx.get('/api/v1/projects?limit=100');
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as ProjectList;
}

async function expectHidden(ctx: APIRequestContext, projectId: string, who: string): Promise<void> {
  const response = await ctx.get(`/api/v1/projects/${projectId}`);
  expect(response.status(), `${who} — body ${await response.text()}`).toBe(404);
  expect(await errorCode(response), who).toBe('PRJ_001');
  expect(
    (await list(ctx)).items.map(item => item.id),
    `${who}: absent from the list too`,
  ).not.toContain(projectId);
}

async function createProject(ctx: APIRequestContext, data: Record<string, unknown>): Promise<APIResponse> {
  return mutate(ctx, 'post', '/api/v1/projects', { data: { name: `e2e-forge-org-${uniqueSuffix()}`, kind: 'new_novel', ...data } });
}

test.describe('novel-forge organisation sharing', () => {
  test('should open an org-shared bot project to a curator of that organisation and to nobody else', async ({ forge }) => {
    const home = await forge.team('share-home');
    const away = await forge.team('share-away');
    const curator = await forge.actor({ label: 'share-curator', organisation: home, roles: ['NovelForgeCurator'] });
    const member = await forge.actor({ label: 'share-member', organisation: home });
    const outsider = await forge.actor({ label: 'share-outsider', organisation: away, roles: ['NovelForgeCurator'] });

    const shared = await insertProject({ owner: { kind: 'bot', id: strayBotId() }, organisationId: home.organisationId, sharedWithOrg: true });
    forge.trackProject(shared);
    const own = await createProject(curator.ctx, {});
    expect(own.status(), await own.text()).toBe(201);
    const ownId = ((await own.json()) as ProjectItem).id;

    const opened = await curator.ctx.get(`/api/v1/projects/${shared}`);
    expect(opened.status(), `a curator of the organisation opens it — body ${await opened.text()}`).toBe(200);
    expect(await opened.json()).toMatchObject({ id: shared, ownerKind: 'bot', sharedWithOrg: true });

    const listed = await list(curator.ctx);
    expect(listed.items.map(item => item.id).sort(), "the curator's list widens to the shared project beside their own").toEqual([ownId, shared].sort());
    expect(listed.total, 'the total counts the widened set').toBe(2);
    expect(listed.items.find(item => item.id === shared)).toMatchObject({ ownerKind: 'bot', sharedWithOrg: true });
    expect(listed.items.find(item => item.id === ownId)).toMatchObject({ ownerKind: 'user', sharedWithOrg: false });

    await expectHidden(member.ctx, shared, 'a member of the organisation without curate');
    await expectHidden(outsider.ctx, shared, 'a curator of another organisation');
    expect((await list(member.ctx)).total).toBe(0);
    expect((await list(outsider.ctx)).total).toBe(0);
  });

  test("should compare owners by kind and id, so a bot sharing a curator's numeric id stays hidden until shared", async ({ forge }) => {
    const team = await forge.team('share-pair');
    const curator = await forge.actor({ label: 'pair-curator', organisation: team, roles: ['NovelForgeCurator'] });
    const twin = await insertProject({ owner: { kind: 'bot', id: curator.user.userId }, organisationId: team.organisationId, sharedWithOrg: false });
    forge.trackProject(twin);

    await expectHidden(curator.ctx, twin, 'a curator whose user id matches the bot owner id of an unshared project');

    await updateProjectOwnership(twin, { sharedWithOrg: true });
    const opened = await curator.ctx.get(`/api/v1/projects/${twin}`);
    expect(opened.status(), `once shared, the same curator reaches it through the sharing branch — body ${await opened.text()}`).toBe(200);
    expect(((await opened.json()) as ProjectItem).ownerKind).toBe('bot');
  });

  test("should stamp a person's project as user-owned, unshared and outside any organisation", async ({ forge }) => {
    const team = await forge.team('share-stamp');
    const curator = await forge.actor({ label: 'stamp-curator', organisation: team, roles: ['NovelForgeCurator'] });

    const created = await createProject(curator.ctx, {});
    expect(created.status(), await created.text()).toBe(201);
    const project = (await created.json()) as ProjectItem;
    expect(project).toMatchObject({ ownerKind: 'user', sharedWithOrg: false });
    expect(await readProjectRow(project.id), 'acting in a team does not hand the project to it').toMatchObject({
      ownerKind: 'user',
      ownerId: curator.user.userId,
      organisationId: null,
      sharedWithOrg: false,
    });
  });

  // job.service.ts:410 (5d38bd83) joins workflow_runs.id (uuid) to model_calls.run_id (varchar), so listing any project's jobs answers 500.
  test.fixme("should list an org-shared project's jobs to its curator", async ({ forge }) => {
    const team = await forge.team('share-jobs');
    const curator = await forge.actor({ label: 'jobs-curator', organisation: team, roles: ['NovelForgeCurator'] });
    const shared = await insertProject({ owner: { kind: 'bot', id: strayBotId() }, organisationId: team.organisationId });
    forge.trackProject(shared);
    const jobId = await insertJob({ projectId: shared, kind: 'backfill', target: 'all' });

    const jobs = await curator.ctx.get(`/api/v1/projects/${shared}/jobs`);
    expect(jobs.status(), await jobs.text()).toBe(200);
    expect(((await jobs.json()) as { items: { id: string }[] }).items.map(job => job.id)).toContain(jobId);
  });

  // jobs.controller.ts:27 scopes GET /jobs/:jobId through job.service.ts:312 getForOwner, which has no curator branch: 404 JOB_001 today.
  test.fixme('should let a curator read a job of a project shared with them by its id', async ({ forge }) => {
    const team = await forge.team('share-job-id');
    const curator = await forge.actor({ label: 'job-id-curator', organisation: team, roles: ['NovelForgeCurator'] });
    const shared = await insertProject({ owner: { kind: 'bot', id: strayBotId() }, organisationId: team.organisationId });
    forge.trackProject(shared);
    const jobId = await insertJob({ projectId: shared, kind: 'backfill', target: 'all' });

    const job = await curator.ctx.get(`/api/v1/jobs/${jobId}`);
    expect(job.status(), `the curator reaches the project, so its job too — body ${await job.text()}`).toBe(200);
    expect(((await job.json()) as { id: string }).id).toBe(jobId);
  });
});

test.describe('novel-forge jobs read by their owner', () => {
  // job.service.ts:410 (5d38bd83) joins workflow_runs.id (uuid) to model_calls.run_id (varchar), so reading any job answers 500.
  test.fixme('should read a job of its own project by id', async ({ forge }) => {
    const author = await forge.actor({ label: 'jobs-owner-id' });
    const created = await createProject(author.ctx, {});
    expect(created.status(), await created.text()).toBe(201);
    const jobId = await insertJob({ projectId: ((await created.json()) as ProjectItem).id, kind: 'backfill', target: 'all', status: 'done' });

    const job = await author.ctx.get(`/api/v1/jobs/${jobId}`);
    expect(job.status(), await job.text()).toBe(200);
    expect(await job.json()).toMatchObject({ id: jobId, kind: 'backfill', status: 'done' });
  });

  // Same join at job.service.ts:410: the project's job list answers 500 once it holds any job.
  test.fixme("should list its own project's jobs", async ({ forge }) => {
    const author = await forge.actor({ label: 'jobs-owner-list' });
    const created = await createProject(author.ctx, {});
    expect(created.status(), await created.text()).toBe(201);
    const projectId = ((await created.json()) as ProjectItem).id;
    const jobId = await insertJob({ projectId, kind: 'backfill', target: 'all', status: 'done' });

    const jobs = await author.ctx.get(`/api/v1/projects/${projectId}/jobs`);
    expect(jobs.status(), await jobs.text()).toBe(200);
    expect(((await jobs.json()) as { items: { id: string }[] }).items.map(job => job.id)).toEqual([jobId]);
  });
});

test.describe('novel-forge retired surfaces', () => {
  test('should answer every retired route 404 rather than reaching a handler', async ({ forge }) => {
    const author = await forge.actor({ label: 'retired' });
    const created = await createProject(author.ctx, {});
    expect(created.status(), await created.text()).toBe(201);
    const base = `/api/v1/projects/${((await created.json()) as ProjectItem).id}`;

    const retired: ['get' | 'post' | 'put' | 'delete', string][] = [
      ['get', '/api/v1/api-keys'],
      ['post', '/api/v1/api-keys'],
      ['delete', '/api/v1/api-keys/1'],
      ['put', '/api/v1/ingest/novels/e2e-novel'],
      ['put', '/api/v1/ingest/projects/1/originals/1'],
      ['get', '/api/v1/seeds'],
      ['post', '/api/v1/seeds'],
      ['post', `${base}/rebrand`],
      ['post', `${base}/reforge`],
      ['get', `${base}/translation`],
      ['post', `${base}/plan/import`],
      ['post', `${base}/recombine`],
      ['post', `${base}/seed/graduate`],
    ];
    for (const [method, path] of retired) {
      const response = method === 'get' ? await author.ctx.get(path) : await mutate(author.ctx, method, path, { data: {} });
      expect(response.status(), `${method.toUpperCase()} ${path} — body ${await response.text()}`).toBe(404);
      expect(await errorCode(response), `${method.toUpperCase()} ${path} is an unknown endpoint`).toBe('S002');
    }

    const live = await author.ctx.get(base);
    expect(live.status(), 'the project the retired routes were aimed at is untouched and reachable').toBe(200);
  });

  test('should refuse the retired project kinds at the schema', async ({ forge }) => {
    const author = await forge.actor({ label: 'retired-kinds' });

    for (const kind of ['translation', 'curated', 'source']) {
      const response = await createProject(author.ctx, { kind });
      expect(response.status(), `kind ${kind} — body ${await response.text()}`).toBe(422);
      expect(await errorCode(response)).toBe('VALIDATION_ERROR');
    }
    expect(await listProjectIdsOwnedBy(author.owner), 'no refused kind left a row behind').toEqual([]);

    const novel = await createProject(author.ctx, { kind: 'new_novel' });
    expect(novel.status(), await novel.text()).toBe(201);
  });
});
