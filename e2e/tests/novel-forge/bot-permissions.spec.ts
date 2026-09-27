/**
 * Importing npm packages
 */
import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { mutate } from '../../lib';
import { expect, type ForgeBot, type ForgeTeam, test } from './forge-actors';
import { assertSpendGuarded, failPin, insertProject, listDispatchedModelCalls, readProjectRow, updateProjectOwnership } from './forge-db';
import { CHAPTER_ONE, errorCode, readDraft, saveChapter, startNextChapter, uniqueSuffix } from './forge-helpers';

/**
 * Defining types
 */

interface ProjectBody {
  readonly id: string;
  readonly ownerKind: 'user' | 'bot';
  readonly sharedWithOrg: boolean;
  readonly costTier: string;
}

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * Declaring the constants
 *
 * What an organisation bot may do on Novel Forge. A route admits a bot only when it declares a bot permission, and the bot must hold
 * every one the route and its controller declare; the guard decides before the body is validated, so an empty body still proves the
 * decision. Anything that could reach a model runs on a quota-pinned project (429 AI_008 before routing), fail-pinned as a backstop.
 */

/** A well-formed chat session id no session carries. */
const UNKNOWN_SESSION = '00000000-0000-4000-8000-000000000000';

async function call(ctx: APIRequestContext, method: Method, path: string, data?: unknown): Promise<APIResponse> {
  return ctx[method](path, data === undefined ? {} : { data });
}

async function expectDenied(response: APIResponse, what: string): Promise<void> {
  expect(response.status(), `${what} — body ${await response.text()}`).toBe(403);
  expect(await errorCode(response), what).toBe('IAM_002');
}

async function expectNotFound(response: APIResponse, what: string): Promise<void> {
  expect(response.status(), `${what} — body ${await response.text()}`).toBe(404);
  expect(await errorCode(response), what).toBe('PRJ_001');
}

async function createOwnProject(bot: ForgeBot): Promise<ProjectBody> {
  const created = await bot.ctx.post('/api/v1/projects', { data: { name: `e2e-forge-bot-${uniqueSuffix()}`, kind: 'new_novel', contentMode: 'standard' } });
  expect(created.status(), `a bot holding projects:write creates a project — body ${await created.text()}`).toBe(201);
  return (await created.json()) as ProjectBody;
}

/** A project the bot owns, inserted directly for a bot that may not create one. */
function seedOwnProject(bot: ForgeBot, team: ForgeTeam): Promise<string> {
  return insertProject({ owner: bot.owner, organisationId: team.organisationId });
}

async function listedIds(ctx: APIRequestContext): Promise<string[]> {
  const response = await ctx.get('/api/v1/projects?limit=100');
  expect(response.status(), await response.text()).toBe(200);
  return ((await response.json()) as { items: ProjectBody[] }).items.map(item => item.id);
}

/** A fail-pinned project with one hand-written chapter, written by a bot that holds projects:write. */
async function projectWithChapter(writer: ForgeBot): Promise<string> {
  const project = await createOwnProject(writer);
  await failPin(project.id);
  await saveChapter(writer.ctx, project.id, await startNextChapter(writer.ctx, project.id), CHAPTER_ONE);
  return project.id;
}

test.describe('novel-forge bot permission matrix', () => {
  test('should let a projects-reader bot read what it owns and refuse it every write', async ({ forge }) => {
    const team = await forge.team('bot-reader');
    const reader = await forge.bot(team, ['projects:read'], 'reader');
    const projectId = await seedOwnProject(reader, team);
    const base = `/api/v1/projects/${projectId}`;

    await expectDenied(await call(reader.ctx, 'post', '/api/v1/projects', { name: 'e2e-denied', kind: 'new_novel' }), 'create a project');
    await expectDenied(await call(reader.ctx, 'patch', base, { title: 'Renamed' }), 'rename the project');
    await expectDenied(await call(reader.ctx, 'delete', base), 'delete the project');
    await expectDenied(await call(reader.ctx, 'put', `${base}/bible/project/default`, { body: 'Overwritten' }), 'write a Story Bible page');
    await expectDenied(await call(reader.ctx, 'post', `${base}/entities`, { key: 'e2e-entity', type: 'character', name: 'Nobody' }), 'create an entity');
    await expectDenied(await call(reader.ctx, 'post', `${base}/drafts/next`, {}), 'open a chapter');

    expect(await listedIds(reader.ctx), 'the reader lists the project it owns').toContain(projectId);
    const read = await reader.ctx.get(base);
    expect(read.status(), `the reader opens it — body ${await read.text()}`).toBe(200);
    expect(((await read.json()) as { title?: string | null }).title ?? null, 'the refused rename changed nothing').toBeNull();
    expect(await readProjectRow(projectId), 'the refused delete removed nothing').toBeDefined();
  });

  test('should refuse generation to a bot without projects:write and admit writing to one holding both', async ({ forge }) => {
    const team = await forge.team('bot-generator');
    const generator = await forge.bot(team, ['projects:read', 'generation'], 'generator');
    const author = await forge.bot(team, ['projects:write', 'generation'], 'author');
    const generatorProject = await seedOwnProject(generator, team);
    await failPin(generatorProject);
    await forge.quotaPin(generatorProject);
    await assertSpendGuarded(generatorProject, { requireQuota: true });

    await expectDenied(await call(generator.ctx, 'post', `/api/v1/projects/${generatorProject}/generate`, {}), 'generate without projects:write');
    await expectDenied(await call(generator.ctx, 'post', `/api/v1/projects/${generatorProject}/drafts/next`, {}), 'open a chapter without projects:write');

    const own = await createOwnProject(author);
    await failPin(own.id);
    const opened = await author.ctx.post(`/api/v1/projects/${own.id}/drafts/next`, { data: {} });
    expect(opened.status(), `a bot holding both opens a chapter — body ${await opened.text()}`).toBe(201);
  });

  test('should admit a bot holding generation and projects:write to summarize, stopping at the spend guard', async ({ forge }) => {
    const team = await forge.team('bot-summary');
    const author = await forge.bot(team, ['projects:write', 'generation'], 'summariser');
    const projectId = await projectWithChapter(author);
    await forge.quotaPin(projectId);
    const before = await readDraft(author.ctx, projectId, 1);

    await assertSpendGuarded(projectId, { requireQuota: true });
    const summarized = await author.ctx.post(`/api/v1/projects/${projectId}/chapters/1/summarize`, { data: {} });
    expect(summarized.status(), `the guard admits it and the quota pin refuses the dispatch — body ${await summarized.text()}`).toBe(429);
    expect(await errorCode(summarized)).toBe('AI_008');

    expect((await readDraft(author.ctx, projectId, 1)).summary, 'a refused summary writes nothing').toBe(before.summary);
    expect(await listDispatchedModelCalls(projectId), 'no model call was dispatched').toEqual([]);
  });

  // generation.controller.ts:246 declares only generation:run on summarize, yet generation.service.ts:910 saves the summary it produces.
  test.fixme('should refuse summarize to a bot that holds generation but not projects:write', async ({ forge }) => {
    const team = await forge.team('bot-summary-gap');
    const author = await forge.bot(team, ['projects:write', 'generation'], 'summary-writer');
    const generator = await forge.bot(team, ['projects:read', 'generation'], 'summary-reader');
    const projectId = await projectWithChapter(author);
    await updateProjectOwnership(projectId, { owner: generator.owner });
    await forge.quotaPin(projectId);
    await assertSpendGuarded(projectId, { requireQuota: true });

    await expectDenied(await generator.ctx.post(`/api/v1/projects/${projectId}/chapters/1/summarize`, { data: {} }), 'summarize persists a summary, so it needs projects:write');
    await expectDenied(await call(generator.ctx, 'put', `/api/v1/projects/${projectId}/chapters/1/summary`, { summary: 'Overwritten' }), 'the hand-written summary route agrees');
  });

  test('should gate the cover on illustrations:write', async ({ forge }) => {
    const team = await forge.team('bot-cover');
    const reader = await forge.bot(team, ['projects:read'], 'cover-reader');
    const illustrator = await forge.bot(team, ['projects:read', 'illustrations'], 'illustrator');
    const readerProject = await seedOwnProject(reader, team);
    const illustratorProject = await seedOwnProject(illustrator, team);

    await expectDenied(await call(reader.ctx, 'delete', `/api/v1/projects/${readerProject}/cover`), 'clear the cover without illustrations:write');

    const cleared = await illustrator.ctx.delete(`/api/v1/projects/${illustratorProject}/cover`);
    expect(cleared.status(), `illustrations:write on top of the read floor is enough — body ${await cleared.text()}`).toBe(200);
    expect(((await cleared.json()) as { id: string }).id).toBe(illustratorProject);
  });

  test('should refuse every bot on routes that declare no bot permission, whatever it holds', async ({ forge }) => {
    const team = await forge.team('bot-closed');
    const bot = await forge.bot(team, ['projects:write', 'generation', 'illustrations'], 'everything');
    const project = await createOwnProject(bot);
    await failPin(project.id);
    const base = `/api/v1/projects/${project.id}`;

    const closed: [Method, string, unknown?][] = [
      ['get', '/api/v1/ai/settings'],
      ['put', '/api/v1/ai/settings', { defaultCostTier: 'economy' }],
      ['get', '/api/v1/ai/models'],
      ['get', '/api/v1/ai/usage'],
      ['get', '/api/v1/ai/quota'],
      ['get', '/api/v1/access'],
      ['post', `${base}/publish`, {}],
      ['post', `${base}/chapters/1/publish`, {}],
      ['get', `${base}/publications/access`],
      ['put', `${base}/publications/access`, { visibility: 'PUBLIC' }],
      ['post', `${base}/publications/reconcile`, {}],
      ['post', `${base}/entities/e2e-entity/illustration`, {}],
    ];
    for (const [method, path, data] of closed) await expectDenied(await call(bot.ctx, method, path, data), `${method.toUpperCase()} ${path}`);

    const open = await bot.ctx.get(base);
    expect(open.status(), `the same bot still reaches a route open to bots — body ${await open.text()}`).toBe(200);
  });

  test('should require every permission the route and its controller declare', async ({ forge }) => {
    const team = await forge.team('bot-accumulate');
    const writer = await forge.bot(team, ['projects:write'], 'writer');
    const full = await forge.bot(team, ['projects:write', 'generation'], 'full');
    const writerProject = await createOwnProject(writer);
    const fullProject = await createOwnProject(full);
    await failPin(fullProject.id);
    await forge.quotaPin(fullProject.id);

    const path = (projectId: string): string => `/api/v1/projects/${projectId}/chat/sessions/${UNKNOWN_SESSION}/messages`;
    await expectDenied(await call(writer.ctx, 'post', path(writerProject.id), { content: 'Hello' }), 'a chat turn needs generation on top of write');

    await assertSpendGuarded(fullProject.id, { requireQuota: true });
    const admitted = await full.ctx.post(path(fullProject.id), { data: { content: 'Hello' } });
    expect(admitted.status(), `holding both, the turn reaches the session lookup — body ${await admitted.text()}`).toBe(404);
    expect(await errorCode(admitted)).toBe('CHT_001');
    expect(await listDispatchedModelCalls(fullProject.id)).toEqual([]);
  });
});

test.describe('novel-forge cross-owner isolation for bots', () => {
  test("should keep a bot out of a rival bot's project in the same organisation, shared or not", async ({ forge }) => {
    const team = await forge.team('bot-rivals');
    const owner = await forge.bot(team, ['projects:write'], 'owner');
    const rival = await forge.bot(team, ['projects:write'], 'rival');

    const project = await createOwnProject(owner);
    expect(project.ownerKind, 'a project a bot creates is bot-owned').toBe('bot');
    expect(project.sharedWithOrg, 'and shared with its organisation from the start').toBe(true);
    expect(project.costTier, 'a bot holds no settings, so its projects start Balanced').toBe('balanced');
    expect(await readProjectRow(project.id)).toMatchObject({ ownerKind: 'bot', ownerId: owner.botId, organisationId: team.organisationId });

    await expectNotFound(await rival.ctx.get(`/api/v1/projects/${project.id}`), 'sharing opens a project to curators, never to another bot');
    expect(await listedIds(rival.ctx)).not.toContain(project.id);

    await updateProjectOwnership(project.id, { sharedWithOrg: false });
    await expectNotFound(await rival.ctx.get(`/api/v1/projects/${project.id}`), 'an unshared bot project');
    expect(await listedIds(rival.ctx)).not.toContain(project.id);

    const own = await owner.ctx.get(`/api/v1/projects/${project.id}`);
    expect(own.status(), `its own bot still opens it — body ${await own.text()}`).toBe(200);
  });

  test("should keep bots and people out of each other's projects", async ({ forge }) => {
    const team = await forge.team('bot-people');
    const bot = await forge.bot(team, ['projects:write'], 'neighbour');
    const author = await forge.actor({ label: 'bot-neighbour' });

    const botProject = await createOwnProject(bot);
    const created = await mutate(author.ctx, 'post', '/api/v1/projects', { data: { name: `e2e-forge-human-${uniqueSuffix()}`, kind: 'new_novel' } });
    expect(created.status(), await created.text()).toBe(201);
    const humanProject = ((await created.json()) as ProjectBody).id;

    await expectNotFound(await bot.ctx.get(`/api/v1/projects/${humanProject}`), "a bot opening a person's project");
    await expectNotFound(await author.ctx.get(`/api/v1/projects/${botProject.id}`), "a person opening a bot's project");
    expect(await listedIds(bot.ctx)).toEqual([botProject.id]);
    expect(await listedIds(author.ctx)).toEqual([humanProject]);
  });
});
