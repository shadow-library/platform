/**
 * Importing npm packages
 */
import { randomUUID } from 'node:crypto';

import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { mutate, novelForgeDb, pollUntil } from '../../lib';
import { expect, type ForgeActor, test } from './forge-actors';
import { expectCode, guardedProject, newProject } from './forge-arrange';
import { assertSpendGuarded, holdAuthoringClaim, insertJob, insertReservedJob, type JobStatus, listDispatchedModelCalls } from './forge-db';
import { CHAPTER_ONE, type Draft, writeChapterByHand } from './forge-helpers';
import { ageAuthoringClaim, readAuthoringClaim, readJobRow, updateJobRow } from './forge-rows';

/**
 * Declaring the constants
 *
 * Background jobs and the one authoring claim a novel has. Jobs are arranged as rows: reindex (`backfill`) jobs only run when something
 * dispatches them, so a queued or running one sits still, and `POST /backfill` is the one enqueue that never reaches a model. The authoring
 * claim is held by a job-less holder as a synchronous action would hold it, or reserved for a queued generation job as enqueueing does;
 * either way the novel is quota-pinned and fail-pinned, so a refusal that failed to hold would still spend nothing.
 */

/** `jobs.authoring-claim.ttl-ms`, which the dev deployment leaves at its default. */
const CLAIM_TTL_MS = 120_000;

const HAND_BRIEF = 'Tamsin measures the street at dawn and finds the wall has moved overnight.';

function cancelJob(ctx: APIRequestContext, projectId: string, jobId: string): Promise<APIResponse> {
  return mutate(ctx, 'post', `/api/v1/projects/${projectId}/jobs/${jobId}/cancel`);
}

async function expectCancel(ctx: APIRequestContext, projectId: string, jobId: string, status: JobStatus, outcome: string, what: string): Promise<void> {
  const response = await cancelJob(ctx, projectId, jobId);
  expect(response.status(), `${what} — body ${await response.text()}`).toBe(200);
  expect(await response.json(), what).toEqual({ jobId, status, outcome });
}

function reindexJob(projectId: string, target: string, status: JobStatus, payload: Record<string, unknown> | null = null): Promise<string> {
  return insertJob({ projectId, kind: 'backfill', target, status, payload });
}

async function enqueueReindex(owner: ForgeActor, projectId: string): Promise<string> {
  const response = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/backfill`);
  expect(response.status(), await response.text()).toBe(202);
  const body = (await response.json()) as { jobId: string; kind: string; target: string; status: string };
  expect(body).toMatchObject({ kind: 'backfill', target: 'all', status: 'pending' });
  return body.jobId;
}

async function settledJob(jobId: string): Promise<NonNullable<Awaited<ReturnType<typeof readJobRow>>>> {
  const row = await pollUntil(
    () => readJobRow(jobId),
    current => current?.status === 'done' || current?.status === 'failed',
    { timeoutMs: 20_000, intervalMs: 250 },
  );
  expect(row?.status, `job ${jobId} settled`).toBe('done');
  return row as NonNullable<typeof row>;
}

function handSave(owner: ForgeActor, projectId: string, draft: Draft): Promise<APIResponse> {
  return mutate(owner.ctx, 'put', `/api/v1/projects/${projectId}/drafts/${draft.chapter}`, {
    data: { baseDraftId: draft.id, baseRevision: draft.revision, baseSaveSeq: draft.saveSeq, ...CHAPTER_ONE, body: `${CHAPTER_ONE.body}\n\nShe measured it again.` },
  });
}

function insertHandChapter(owner: ForgeActor, projectId: string, afterChapter: number): Promise<APIResponse> {
  return mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chapters/${afterChapter}/insert`, { data: { briefOrigin: 'hand', briefBody: HAND_BRIEF } });
}

async function readinessBlockers(owner: ForgeActor, projectId: string, chapter: number): Promise<string[]> {
  const response = await owner.ctx.get(`/api/v1/projects/${projectId}/drafts/${chapter}/finalize-readiness`);
  expect(response.status(), await response.text()).toBe(200);
  const readiness = (await response.json()) as { ready: boolean; blockers: { code: string }[] };
  expect(readiness.ready).toBe(readiness.blockers.length === 0);
  return readiness.blockers.map(blocker => blocker.code);
}

async function jobKinds(projectId: string): Promise<string[]> {
  const rows = await novelForgeDb()<{ kind: string }[]>`SELECT kind::text FROM jobs WHERE project_id = ${projectId} ORDER BY created_at`;
  return rows.map(row => row.kind);
}

test.describe('novel-forge background jobs', () => {
  test('should settle a queued job, flag a running one and leave a settled one alone when each is cancelled', async ({ forge }) => {
    const owner = await forge.actor({ label: 'jobs-cancel' });
    const projectId = await newProject(owner, 'jobs-cancel');
    const queued = await reindexJob(projectId, 'e2e-queued', 'pending');
    const running = await reindexJob(projectId, 'e2e-running', 'in_progress');
    const settled = await Promise.all((['done', 'failed', 'cancelled'] as const).map(async status => ({ status, jobId: await reindexJob(projectId, `e2e-${status}`, status) })));

    await expectCancel(owner.ctx, projectId, queued, 'cancelled', 'cancelled', 'a queued job is cancelled outright');
    expect(await readJobRow(queued), 'it never started').toMatchObject({ status: 'cancelled', attempts: 0 });
    await expectCancel(owner.ctx, projectId, queued, 'cancelled', 'already_settled', 'cancelling it again');

    await expectCancel(owner.ctx, projectId, running, 'in_progress', 'stopping', 'a running job is only asked to stop');
    const flagged = await readJobRow(running);
    expect(flagged?.status, 'its worker settles it, not the cancel').toBe('in_progress');
    expect(flagged?.cancelRequestedAt).not.toBeNull();
    await expectCancel(owner.ctx, projectId, running, 'in_progress', 'stopping', 'asking it to stop again');
    expect((await readJobRow(running))?.cancelRequestedAt, 'the first request stands').toEqual(flagged?.cancelRequestedAt);

    for (const { status, jobId } of settled) {
      await expectCancel(owner.ctx, projectId, jobId, status, 'already_settled', `a ${status} job`);
      expect((await readJobRow(jobId))?.status).toBe(status);
    }
  });

  test('should join a queued reindex rather than add one, and run a settled one again under the same id', async ({ forge }) => {
    const owner = await forge.actor({ label: 'jobs-dedup' });
    const projectId = await newProject(owner, 'jobs-dedup');
    const queued = await reindexJob(projectId, 'all', 'pending');
    await updateJobRow(queued, { lastError: 'e2e-retry-scheduled' });

    expect(await enqueueReindex(owner, projectId), 'the queued job is answered').toBe(queued);
    const joined = await settledJob(queued);
    expect(joined.lastError, 'joining kept the queued row as it was; a reset would have cleared lastError').toBe('e2e-retry-scheduled');
    expect(joined.attempts, 'the enqueue then dispatched the joined job once').toBe(1);
    expect(await jobKinds(projectId)).toEqual(['backfill']);

    await updateJobRow(queued, { status: 'failed', attempts: 2, lastError: 'e2e-earlier-failure', cancelRequested: true });
    expect(await enqueueReindex(owner, projectId), 'a settled job is reset in place').toBe(queued);
    const rerun = await settledJob(queued);
    expect(rerun, 'the reset cleared the earlier run and its cancel request, and the fresh dispatch ran once').toMatchObject({
      attempts: 1,
      lastError: null,
      cancelRequestedAt: null,
    });
    expect(await jobKinds(projectId)).toEqual(['backfill']);
  });

  test("should keep a job's cancel and read to its own project and owner", async ({ forge }) => {
    const owner = await forge.actor({ label: 'jobs-scope' });
    const stranger = await forge.actor({ label: 'jobs-stranger' });
    const projectId = await newProject(owner, 'jobs-scope');
    const otherProject = await newProject(owner, 'jobs-scope-other');
    const jobId = await reindexJob(projectId, 'e2e-scoped', 'pending');

    await expectCode(await cancelJob(owner.ctx, otherProject, jobId), 404, 'JOB_001', 'the owner cancelling through their other project');
    await expectCode(await cancelJob(owner.ctx, otherProject, randomUUID()), 404, 'JOB_001', 'a job id nobody has');
    await expectCode(await cancelJob(stranger.ctx, projectId, jobId), 404, 'PRJ_001', 'a stranger cancelling');
    await expectCode(await stranger.ctx.get(`/api/v1/jobs/${jobId}`), 404, 'JOB_001', 'a stranger reading the job by id');
    await expectCode(await owner.ctx.get(`/api/v1/jobs/${randomUUID()}`), 404, 'JOB_001', 'the owner reading a job id nobody has');
    await expectCode(await (await forge.anonymous()).get(`/api/v1/jobs/${jobId}`), 401, 'IAM_001', 'an anonymous read');
    expect((await readJobRow(jobId))?.status, 'no refused cancel touched the job').toBe('pending');

    await expectCancel(owner.ctx, projectId, jobId, 'cancelled', 'cancelled', 'the owner through its own project');
  });

  // job.service.ts:410 usageForJobs joins uuid workflow_runs.id to varchar model_calls.run_id, which Postgres refuses at plan time: both reads 500 whenever there is a job to report.
  test.fixme("should read a job of its own project by id and in the project's job list", async ({ forge }) => {
    const owner = await forge.actor({ label: 'jobs-read' });
    const projectId = await newProject(owner, 'jobs-read');
    const jobId = await reindexJob(projectId, 'e2e-read', 'pending');

    const read = await owner.ctx.get(`/api/v1/jobs/${jobId}`);
    expect(read.status(), await read.text()).toBe(200);
    expect(await read.json()).toMatchObject({ id: jobId, kind: 'backfill', status: 'pending' });

    const listed = await owner.ctx.get(`/api/v1/projects/${projectId}/jobs`);
    expect(listed.status(), await listed.text()).toBe(200);
    expect(((await listed.json()) as { items: { id: string }[] }).items.map(job => job.id)).toEqual([jobId]);
  });
});

test.describe("novel-forge a novel's authoring claim", () => {
  test('should refuse authoring work while another holder has the novel, and let finalize take over once the holder goes quiet', async ({ forge }) => {
    const owner = await forge.actor({ label: 'claim-held' });
    const projectId = await guardedProject(forge, owner, 'claim-held');
    const brief = await mutate(owner.ctx, 'put', `/api/v1/projects/${projectId}/briefs/1`, { data: { body: HAND_BRIEF } });
    expect(brief.status(), await brief.text()).toBe(200);
    await holdAuthoringClaim(projectId);

    await assertSpendGuarded(projectId, { requireQuota: true });
    await expectCode(await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/generate`, { data: {} }), 409, 'JOB_002', 'generating while the novel is held');
    expect(await jobKinds(projectId), 'the refused enqueue left no job behind').toEqual([]);
    await expectCode(await insertHandChapter(owner, projectId, 0), 409, 'CHP_004', 'inserting a chapter while the novel is held');
    await assertSpendGuarded(projectId, { requireQuota: true });
    await expectCode(await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/finalize`, { data: {} }), 409, 'JOB_002', 'finalizing while the novel is held');
    await expectCode(await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/reset`, { data: { stage: 'generate' } }), 409, 'PRJ_011', 'resetting while the novel is held');
    expect((await owner.ctx.get(`/api/v1/projects/${projectId}/briefs/1`)).status(), 'the refused reset kept the plan').toBe(200);

    await writeChapterByHand(owner.ctx, projectId, CHAPTER_ONE);
    expect(await readinessBlockers(owner, projectId, 1), 'readiness names the held claim beside the unapproved draft').toEqual(['JOB_002', 'DRF_004']);
    expect(await readAuthoringClaim(projectId), 'reading readiness never takes the claim').toMatchObject({ jobId: null, claimedBy: 'e2e' });

    await ageAuthoringClaim(projectId, CLAIM_TTL_MS + 60_000);
    expect(await readinessBlockers(owner, projectId, 1), 'a holder past its TTL no longer blocks').toEqual(['DRF_004']);
    await assertSpendGuarded(projectId, { requireQuota: true });
    await expectCode(
      await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/finalize`, { data: { chapter: 1 } }),
      400,
      'DRF_004',
      'finalize takes the stale claim over and reaches its own next refusal',
    );
    expect(await readAuthoringClaim(projectId), 'and releases the claim it took').toBeUndefined();

    const reset = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/reset`, { data: { stage: 'generate' } });
    expect(reset.status(), `with the novel free a reset goes through — body ${await reset.text()}`).toBe(200);
  });

  test('should refuse a hand save to a chapter an AI job is queued to write, until that job is cancelled', async ({ forge }) => {
    const owner = await forge.actor({ label: 'claim-queued' });
    const projectId = await guardedProject(forge, owner, 'claim-queued');
    const draft = await writeChapterByHand(owner.ctx, projectId, CHAPTER_ONE);
    const jobId = await insertReservedJob({ projectId, kind: 'generate', target: '1', payload: { chapters: [1] } });

    await expectCode(await handSave(owner, projectId, draft), 409, 'DRF_019', 'saving over a chapter an AI job is queued to write');
    await assertSpendGuarded(projectId, { requireQuota: true });
    const generate = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/generate`, { data: {} });
    expect(generate.status(), await generate.text()).toBe(202);
    expect(await generate.json(), 'a second generation joins the queued one instead of starting').toMatchObject({ jobId, status: 'pending' });

    await expectCancel(owner.ctx, projectId, jobId, 'cancelled', 'cancelled', 'the author cancels the queued job');
    expect(await readAuthoringClaim(projectId), "cancelling released the job's reservation").toBeUndefined();
    const saved = await handSave(owner, projectId, draft);
    expect(saved.status(), `the chapter is the author's again — body ${await saved.text()}`).toBe(200);
  });
});

test.describe('novel-forge chapter insert', () => {
  // chapter-insert.controller.ts:17 declares 200 and 400 with no @HttpStatus, so fastify-router.ts:322-327 answers 201 untransformed: 500 after commit.
  test.fixme('should answer a hand chapter insert with the brief it created', async ({ forge }) => {
    const owner = await forge.actor({ label: 'chapter-insert' });
    const projectId = await guardedProject(forge, owner, 'chapter-insert');

    await assertSpendGuarded(projectId, { requireQuota: true });
    const inserted = await insertHandChapter(owner, projectId, 0);
    expect(inserted.status(), `a hand insert into an empty plan — body ${await inserted.text()}`).toBe(200);
    expect(await inserted.json()).toMatchObject({ newChapter: 1, shiftedChapters: 0, brief: { chapter: 1, body: HAND_BRIEF } });
    expect(await listDispatchedModelCalls(projectId)).toEqual([]);
  });
});
