/**
 * The test IdP must be evaluated first: it stands up the mock issuer the push client's AuthClient
 * mints its `web-novel:publish` tokens against.
 */
import { APP_ID, AUTH_AUDIENCE, CLIENT_SECRET, testIdP } from '@tests/test-idp';

import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import { AuthClient } from '@shadow-library/auth';

import { ConcurrencyController } from '@modules/jobs/concurrency.controller';
import { JobExecutor } from '@modules/jobs/job.executor';
import { JobService } from '@modules/jobs/job.service';
import { PublicationJanitor } from '@modules/jobs/publication.janitor';
import { PublicationAccessService } from '@modules/publishing/publication-access.service';
import { PublishRunner } from '@modules/publishing/publish-runner';
import { PublishingService } from '@modules/publishing/publishing.service';
import { ReaderPushClient } from '@modules/publishing/reader-push.client';
import { WikiPublishingService } from '@modules/publishing/wiki-publishing.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

import { MockReaderService } from './mock-reader';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_publish_runner`;

const pgAvailable = await (async () => {
  try {
    const sql = new SQL(baseConnectionString);
    await sql`SELECT 1`;
    await sql.close();
    return true;
  } catch {
    return false;
  }
})();

let slugCounter = 0;

describe.if(pgAvailable)('PublishRunner (mocked reader service)', () => {
  const reader = new MockReaderService();
  let db: PrimaryDatabase;
  let databaseService: never;
  let publishingService: PublishingService;
  let accessService: PublicationAccessService;
  let wikiService: WikiPublishingService;
  let runner: PublishRunner;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    databaseService = { getPostgresClient: () => db } as never;
    publishingService = new PublishingService(databaseService);
    // The shared, discovery-backed client the AuthModule would inject in a real boot — here built
    // directly against the mock issuer with the app's own credential.
    const authClient = new AuthClient({ issuer: testIdP.issuer, appId: APP_ID, client: { id: APP_ID, secret: CLIENT_SECRET } });
    accessService = new PublicationAccessService(databaseService, publishingService, authClient);
    wikiService = new WikiPublishingService(databaseService);
    runner = new PublishRunner(databaseService, publishingService, new ReaderPushClient(authClient), accessService, wikiService);

    process.env['SERVICE_URL_WEB_NOVEL_SERVER'] = reader.start();
  });

  // The reader URL env is process-global; leaving it set would point a dead reader at every later
  // spec file. Closing the pool keeps later suites from starving.
  afterAll(() => {
    reader.stop();
    delete process.env['SERVICE_URL_WEB_NOVEL_SERVER'];
    (db as unknown as { $client: SQL }).$client.close();
  });

  async function seedPublishedProject(chapters: number, options: { scheduledAt?: string } = {}): Promise<{ projectId: bigint; slug: string }> {
    const slug = `runner-novel-${++slugCounter}`;
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `publish-runner-${slugCounter}-${Date.now()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    await publishingService.publishNovel(project.id, { novelSlug: slug, title: `Runner Novel ${slugCounter}`, blurb: 'Pushed by tests.' });
    for (let n = 1; n <= chapters; n++) {
      await db
        .insert(schema.chapters)
        .values({ projectId: project.id, number: n, title: `Chapter ${n}`, content: `Prose of chapter ${n}.`, note: 'note', status: 'done', locked: true });
      await publishingService.publishChapter(project.id, n, { scheduledAt: options.scheduledAt });
    }
    return { projectId: project.id, slug };
  }

  function ledgerRow(projectId: bigint, ordinal: number): Promise<schema.Publishing.ChapterPublication | undefined> {
    return db.query.chapterPublications.findFirst({
      where: and(eq(schema.chapterPublications.projectId, projectId), eq(schema.chapterPublications.publishedOrdinal, ordinal)),
    });
  }

  it('should push the novel and due chapters with a scoped M2M token and ledger them published', async () => {
    const { projectId, slug } = await seedPublishedProject(2);

    const result = await runner.converge(projectId);
    expect(result).toMatchObject({ novel: 'applied', pushed: [1, 2], deleted: [], failed: [], unknownOrdinals: [] });

    const novel = reader.novels.get(slug);
    expect(novel).toMatchObject({ title: 'Runner Novel 1', blurb: 'Pushed by tests.', status: 'live', revision: 1 });
    expect([...(novel?.chapters.keys() ?? [])]).toEqual([1, 2]);

    const row = await ledgerRow(projectId, 1);
    expect(row).toMatchObject({ status: 'published', error: null, revision: 1 });
    expect(row?.publishedAt).toBeInstanceOf(Date);
    expect(novel?.chapters.get(1)?.contentHash).toBe(row?.contentHash as string);

    // The push rode an identity-issued client-credentials token scoped to the reader's audience.
    const tokenRequest = testIdP.getLastTokenRequest();
    expect(tokenRequest?.body).toMatchObject({ grant_type: 'client_credentials', scope: 'web-novel:publish', resource: 'api://web-novel' });
    expect(reader.requests.every(request => request.hasBearer)).toBe(true);
  });

  it('should make retries and replays no-ops: converged state skips, re-pushes answer 204', async () => {
    const { projectId, slug } = await seedPublishedProject(2);
    await runner.converge(projectId);

    const second = await runner.converge(projectId);
    expect(second).toMatchObject({ novel: 'noop', pushed: [], failed: [], skipped: [1, 2] });

    // A replay after a lost ack: rows forced back to scheduled push again, the reader answers 204.
    await db.update(schema.chapterPublications).set({ status: 'scheduled' }).where(eq(schema.chapterPublications.projectId, projectId));
    const replay = await runner.converge(projectId);
    expect(replay).toMatchObject({ pushed: [1, 2], failed: [] });
    expect(reader.novels.get(slug)?.chapters.get(1)?.revision).toBe(1);
    expect((await ledgerRow(projectId, 1))?.status).toBe('published');
  });

  it('should ledger a failed push as the outbox and converge once the reader recovers', async () => {
    const { projectId, slug } = await seedPublishedProject(2);
    reader.failOrdinals.add(2);

    const first = await runner.converge(projectId);
    expect(first.pushed).toEqual([1]);
    expect(first.failed).toEqual([{ ordinal: 2, error: expect.stringContaining('http 500') }]);
    expect(await ledgerRow(projectId, 2)).toMatchObject({ status: 'failed', error: expect.stringContaining('http 500') });

    reader.failOrdinals.clear();
    const retry = await runner.converge(projectId);
    expect(retry.pushed).toEqual([2]);
    expect(await ledgerRow(projectId, 2)).toMatchObject({ status: 'published', error: null });
    expect(reader.novels.get(slug)?.chapters.size).toBe(2);
  });

  it('should treat a reader-side newer revision as fatal and never auto-overwrite it', async () => {
    const { projectId, slug } = await seedPublishedProject(1);
    await runner.converge(projectId);

    // The reader somehow holds a newer revision than our ledger — our ledger is stale.
    const served = reader.novels.get(slug)?.chapters.get(1);
    if (!served) throw new Error('reader lost the chapter');
    served.revision = 5;
    served.contentHash = 'foreign-hash';

    await db
      .update(schema.chapters)
      .set({ content: 'Repaired prose.' })
      .where(and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, 1)));
    await publishingService.publishChapter(projectId, 1, {});

    const result = await runner.converge(projectId);
    expect(result.failed).toEqual([{ ordinal: 1, error: expect.stringContaining('stale revision:') }]);
    expect(await ledgerRow(projectId, 1)).toMatchObject({ status: 'failed', error: expect.stringContaining('stale revision:') });
    expect(reader.novels.get(slug)?.chapters.get(1)?.contentHash).toBe('foreign-hash');
  });

  it('should refuse to push prose that drifted after the publish decision', async () => {
    const { projectId } = await seedPublishedProject(1);
    // The canonical prose changes after the decision but without a republish (no ledger update).
    await db
      .update(schema.chapters)
      .set({ content: 'Drifted prose the author never re-approved.' })
      .where(and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, 1)));

    const result = await runner.converge(projectId);
    expect(result.failed).toEqual([{ ordinal: 1, error: expect.stringContaining('republish') }]);
    expect(await ledgerRow(projectId, 1)).toMatchObject({ status: 'failed' });
  });

  it('should delete ledgered-unpublished ordinals but never touch unknown reader extras', async () => {
    const { projectId, slug } = await seedPublishedProject(2);
    await runner.converge(projectId);
    await publishingService.unpublishChapter(projectId, 2);
    reader.novels.get(slug)?.chapters.set(99, { title: 'Extra', content: 'x', authorNote: null, contentHash: 'x', revision: 1, wordCount: 1, publishedAt: null });

    const result = await runner.converge(projectId);
    expect(result.deleted).toEqual([2]);
    expect(result.unknownOrdinals).toEqual([99]);
    expect(reader.novels.get(slug)?.chapters.has(2)).toBe(false);
    expect(reader.novels.get(slug)?.chapters.has(99)).toBe(true);

    const repeat = await runner.converge(projectId);
    expect(repeat.deleted).toEqual([]);
    expect(repeat.skipped).toContain(2);
  });

  it('should rebuild identical serving state from the ledger after the reader is wiped', async () => {
    const { projectId, slug } = await seedPublishedProject(3);
    await runner.converge(projectId);
    const before = reader.snapshot()[slug];

    reader.wipe();
    const result = await runner.converge(projectId, { reconcile: true });
    expect(result.failed).toEqual([]);
    expect(result.pushed).toEqual([1, 2, 3]);
    expect(reader.snapshot()[slug]).toEqual(before);
  });

  it('should fail soft with an actionable ledger error when the client cannot mint a reader token', async () => {
    const { projectId } = await seedPublishedProject(1);
    // A credential-less client (an id, but no secret) is refused by the token endpoint, so every mint —
    // and therefore every push — fails; the runner ledgers it and answers PUB_004 rather than crashing.
    const credlessClient = new AuthClient({ issuer: testIdP.issuer, audience: AUTH_AUDIENCE, client: { id: APP_ID } });
    const credlessRunner = new PublishRunner(databaseService, publishingService, new ReaderPushClient(credlessClient), accessService, wikiService);

    await expect(credlessRunner.converge(projectId)).rejects.toThrow(/Reader service push failed/);
    expect(await ledgerRow(projectId, 1)).toMatchObject({ status: 'failed', error: expect.stringContaining('reader service') });
  });

  it('should release scheduled chapters through the janitor sweep and the publish job executor', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const { projectId, slug } = await seedPublishedProject(1, { scheduledAt: past });
    const future = new Date(Date.now() + 3_600_000).toISOString();
    await db.insert(schema.chapters).values({ projectId, number: 2, title: 'Chapter 2', content: 'Prose of chapter 2.', status: 'done', locked: true });
    await publishingService.publishChapter(projectId, 2, { scheduledAt: future });

    const jobService = new JobService(databaseService);
    const executor = new JobExecutor(jobService, new ConcurrencyController(), {} as never, {} as never, databaseService, {} as never, {} as never, runner, {} as never);
    const janitor = new PublicationJanitor(databaseService, jobService, executor);

    const swept = await janitor.sweep();
    expect(swept.map(String)).toContain(String(projectId));

    // dispatch() resolves before the job body settles only when the lock queue is contended; poll the row.
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && (await ledgerRow(projectId, 1))?.status !== 'published') await new Promise(resolve => setTimeout(resolve, 50));

    expect(await ledgerRow(projectId, 1)).toMatchObject({ status: 'published' });
    expect(await ledgerRow(projectId, 2)).toMatchObject({ status: 'scheduled' });
    expect(reader.novels.get(slug)?.chapters.has(1)).toBe(true);
    expect(reader.novels.get(slug)?.chapters.has(2)).toBe(false);

    const job = await db.query.jobs.findFirst({ where: and(eq(schema.jobs.projectId, projectId), eq(schema.jobs.kind, 'publish')) });
    expect(job?.status).toBe('done');

    // A sweep with nothing due for this project leaves it alone (the future row is not yet released).
    const again = await janitor.sweep();
    expect(again.map(String)).not.toContain(String(projectId));
  });

  it('should mark the publish job failed while pushes fail so the sweep keeps retrying', async () => {
    const { projectId } = await seedPublishedProject(1);
    reader.failOrdinals.add(1);

    const jobService = new JobService(databaseService);
    const executor = new JobExecutor(jobService, new ConcurrencyController(), {} as never, {} as never, databaseService, {} as never, {} as never, runner, {} as never);
    const jobId = await jobService.enqueue(projectId, 'publish', `publish-${projectId}`);
    await executor.dispatch(jobId);

    const job = await db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) });
    expect(job?.status).toBe('failed');
    expect(job?.lastError).toContain('publication ledger');
    expect(await ledgerRow(projectId, 1)).toMatchObject({ status: 'failed' });

    reader.failOrdinals.clear();
    const janitor = new PublicationJanitor(databaseService, jobService, executor);
    const swept = await janitor.sweep();
    expect(swept.map(String)).toContain(String(projectId));

    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && (await ledgerRow(projectId, 1))?.status !== 'published') await new Promise(resolve => setTimeout(resolve, 50));
    expect(await ledgerRow(projectId, 1)).toMatchObject({ status: 'published', error: null });
  });
});
