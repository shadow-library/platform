/**
 * The test IdP must be evaluated first: it stands up the mock issuer the push client's AuthClient
 * mints its `web-novel:publish` tokens against.
 */
import { APP_ID, CLIENT_SECRET, testIdP } from '@tests/test-idp';

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

interface SeedEntityOptions {
  entityKey?: string;
  name?: string;
  body?: string | null;
  firstSeenChapter?: number | null;
  aliases?: string[];
  wikiVisibility?: 'default' | 'hidden';
}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_wiki_publishing`;

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

describe.if(pgAvailable)('Wiki publish pipeline (mocked reader service)', () => {
  const reader = new MockReaderService();
  let db: PrimaryDatabase;
  let databaseService: never;
  let publishingService: PublishingService;
  let wikiService: WikiPublishingService;
  let runner: PublishRunner;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    databaseService = { getPostgresClient: () => db } as never;
    publishingService = new PublishingService(databaseService);
    wikiService = new WikiPublishingService(databaseService);
    const authClient = new AuthClient({ issuer: testIdP.issuer, appId: APP_ID, client: { id: APP_ID, secret: CLIENT_SECRET } });
    const accessService = new PublicationAccessService(databaseService, publishingService, authClient);
    runner = new PublishRunner(databaseService, publishingService, new ReaderPushClient(authClient), accessService, wikiService);

    process.env['SERVICE_URL_WEB_NOVEL_SERVER'] = reader.start();
  });

  afterAll(() => {
    reader.stop();
    delete process.env['SERVICE_URL_WEB_NOVEL_SERVER'];
    (db as unknown as { $client: SQL }).$client.close();
  });

  async function seedProject(chapters: number): Promise<{ projectId: bigint; slug: string }> {
    const slug = `wiki-novel-${++slugCounter}`;
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `wiki-${slugCounter}-${Date.now()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    await publishingService.publishNovel(project.id, { novelSlug: slug, title: `Wiki Novel ${slugCounter}` });
    for (let n = 1; n <= chapters; n++) {
      await db.insert(schema.chapters).values({ projectId: project.id, number: n, title: `Chapter ${n}`, content: `Prose ${n}.`, status: 'done', locked: true });
      await publishingService.publishChapter(project.id, n, {});
    }
    return { projectId: project.id, slug };
  }

  async function addEntity(projectId: bigint, options: SeedEntityOptions = {}): Promise<bigint> {
    const [entity] = await db
      .insert(schema.entities)
      .values({
        projectId,
        entityKey: options.entityKey ?? 'amara',
        type: 'character',
        name: options.name ?? 'Detective Amara',
        body: options.body === undefined ? 'A weathered detective.' : options.body,
        significance: 'major',
        firstSeenChapter: options.firstSeenChapter === undefined ? 1 : options.firstSeenChapter,
        wikiVisibility: options.wikiVisibility ?? 'default',
      })
      .returning();
    if (!entity) throw new Error('failed to seed entity');
    for (const alias of options.aliases ?? []) await db.insert(schema.entityAliases).values({ entityId: entity.id, alias });
    return entity.id;
  }

  /** Adds a canon fact about `subjectKey` and a ledger row learning it in `learnedInChapter`. */
  async function addRevealedFact(projectId: bigint, entityId: bigint, subjectKey: string, factKey: string, learnedInChapter: number): Promise<void> {
    const [fact] = await db
      .insert(schema.canonFacts)
      .values({ projectId, factKey, text: `Secret about ${subjectKey}.`, subjects: [subjectKey] })
      .returning();
    if (!fact) throw new Error('failed to seed fact');
    await db.insert(schema.characterKnowledge).values({ projectId, factId: fact.id, entityId, learnedInChapter, source: 'manual' });
  }

  function wikiRow(projectId: bigint, entryKey: string): Promise<schema.Publishing.WikiPublication | undefined> {
    return db.query.wikiPublications.findFirst({ where: and(eq(schema.wikiPublications.projectId, projectId), eq(schema.wikiPublications.entryKey, entryKey)) });
  }

  it('should push each visible entity as a wiki entry after the chapters converge and ledger it pushed', async () => {
    const { projectId, slug } = await seedProject(1);
    await addEntity(projectId, { aliases: ['The Hound'] });

    const result = await runner.converge(projectId);
    expect(result.wiki).toMatchObject({ pushed: ['amara'], deleted: [], failed: [], unknownEntries: [] });

    const entry = reader.novels.get(slug)?.wiki.get('amara');
    expect(entry).toMatchObject({ type: 'character', name: 'Detective Amara', revision: 1 });
    expect(entry?.facets.map(facet => (facet as { facetKey: string }).facetKey)).toEqual(['profile', 'aliases']);

    const row = await wikiRow(projectId, 'amara');
    expect(row).toMatchObject({ state: 'pushed', error: null, revision: 1 });
    expect(row?.contentHash).toBe(entry?.contentHash as string);

    // Wiki rides the same M2M token and lands strictly after the chapter push (it reads their fresh ordinals).
    const chapterIndex = reader.requests.findIndex(request => request.method === 'PUT' && request.path.includes('/chapters/'));
    const wikiIndex = reader.requests.findIndex(request => request.method === 'PUT' && request.path.includes('/wiki/'));
    expect(chapterIndex).toBeGreaterThanOrEqual(0);
    expect(wikiIndex).toBeGreaterThan(chapterIndex);
  });

  it('should reveal a spoiler fact only once its reveal chapter is published, bumping the revision', async () => {
    const { projectId, slug } = await seedProject(1);
    const entityId = await addEntity(projectId);
    await addRevealedFact(projectId, entityId, 'amara', 'amara_secret', 2);

    await runner.converge(projectId);
    const beforeReveal = reader.novels.get(slug)?.wiki.get('amara');
    expect(beforeReveal?.facets.map(facet => (facet as { facetKey: string }).facetKey)).toEqual(['profile']);
    expect((await wikiRow(projectId, 'amara'))?.revision).toBe(1);

    // Chapter 2 is where the fact is learned; until it is live the fact stays withheld, then appears.
    await db.insert(schema.chapters).values({ projectId, number: 2, title: 'Chapter 2', content: 'Prose 2.', status: 'done', locked: true });
    await publishingService.publishChapter(projectId, 2, {});

    const result = await runner.converge(projectId);
    expect(result.wiki.pushed).toContain('amara');
    const afterReveal = reader.novels.get(slug)?.wiki.get('amara');
    expect(afterReveal?.facets.map(facet => (facet as { facetKey: string }).facetKey)).toEqual(['profile', 'fact:amara_secret']);
    expect((await wikiRow(projectId, 'amara'))?.revision).toBe(2);
  });

  it('should bump the revision only when the projection actually changes', async () => {
    const { projectId } = await seedProject(1);
    await addEntity(projectId);
    await runner.converge(projectId);

    const unchanged = await runner.converge(projectId);
    expect(unchanged.wiki).toMatchObject({ pushed: [], skipped: ['amara'] });
    expect((await wikiRow(projectId, 'amara'))?.revision).toBe(1);

    await db
      .update(schema.entities)
      .set({ body: 'A retired, weathered detective.' })
      .where(and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, 'amara')));
    const changed = await runner.converge(projectId);
    expect(changed.wiki.pushed).toEqual(['amara']);
    expect((await wikiRow(projectId, 'amara'))?.revision).toBe(2);
  });

  it('should tombstone and delete a wiki entry from the reader when its entity is hidden', async () => {
    const { projectId, slug } = await seedProject(1);
    await addEntity(projectId);
    await runner.converge(projectId);
    expect(reader.novels.get(slug)?.wiki.has('amara')).toBe(true);

    await db
      .update(schema.entities)
      .set({ wikiVisibility: 'hidden' })
      .where(and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, 'amara')));
    const result = await runner.converge(projectId);
    expect(result.wiki.deleted).toEqual(['amara']);
    expect(reader.novels.get(slug)?.wiki.has('amara')).toBe(false);
    expect((await wikiRow(projectId, 'amara'))?.state).toBe('deleted');

    // A tombstoned entry is a no-op on the next converge, and the janitor never re-sweeps it.
    const repeat = await runner.converge(projectId);
    expect(repeat.wiki.deleted).toEqual([]);
    expect(repeat.wiki.skipped).toContain('amara');
  });

  it('should reconcile the ledger: insert new entries, leave unchanged ones, and tombstone removed ones', async () => {
    const { projectId } = await seedProject(1);
    // First-seen pre-story (ordinal 0) so both project without depending on a chapter going live — this
    // test exercises the ledger diff, not the spoiler gate.
    await addEntity(projectId, { entityKey: 'amara', firstSeenChapter: null });
    await addEntity(projectId, { entityKey: 'boone', name: 'Sergeant Boone', firstSeenChapter: null });

    const first = await wikiService.reconcileLedger(projectId, await wikiService.computeProjections(projectId));
    expect(first.map(row => [row.entryKey, row.state])).toEqual([
      ['amara', 'pending'],
      ['boone', 'pending'],
    ]);

    // Mark them pushed, then re-reconcile with one entity dropped: amara unchanged, boone tombstoned.
    await db.update(schema.wikiPublications).set({ state: 'pushed' }).where(eq(schema.wikiPublications.projectId, projectId));
    await db.delete(schema.entities).where(and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, 'boone')));

    const second = await wikiService.reconcileLedger(projectId, await wikiService.computeProjections(projectId));
    expect(second.find(row => row.entryKey === 'amara')).toMatchObject({ state: 'pushed', revision: 1 });
    expect(second.find(row => row.entryKey === 'boone')).toMatchObject({ state: 'deleted' });
  });

  it('should rebuild identical wiki serving state from the ledger after the reader is wiped', async () => {
    const { projectId, slug } = await seedProject(2);
    await addEntity(projectId);
    await runner.converge(projectId);
    const before = reader.snapshot()[slug];

    reader.wipe();
    const result = await runner.converge(projectId, { reconcile: true });
    expect(result.wiki.failed).toEqual([]);
    expect(result.wiki.pushed).toContain('amara');
    expect(reader.snapshot()[slug]).toEqual(before);
  });

  it('should ledger a failed wiki push as the outbox and retry it through the janitor sweep', async () => {
    const { projectId } = await seedProject(1);
    await addEntity(projectId);
    reader.failWikiEntries.add('amara');

    const jobService = new JobService(databaseService);
    const executor = new JobExecutor(
      jobService,
      new ConcurrencyController(),
      {} as never,
      {} as never,
      databaseService,
      {} as never,
      {} as never,
      {} as never,
      runner,
      {} as never,
    );
    const jobId = await jobService.enqueue(projectId, 'publish', `publish-${projectId}`);
    await executor.dispatch(jobId);

    expect((await db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) }))?.status).toBe('failed');
    expect(await wikiRow(projectId, 'amara')).toMatchObject({ state: 'failed', error: expect.stringContaining('http 500') });

    reader.failWikiEntries.clear();
    const janitor = new PublicationJanitor(databaseService, jobService, executor);
    const swept = await janitor.sweep();
    expect(swept.map(String)).toContain(String(projectId));

    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && (await wikiRow(projectId, 'amara'))?.state !== 'pushed') await new Promise(resolve => setTimeout(resolve, 50));
    expect(await wikiRow(projectId, 'amara')).toMatchObject({ state: 'pushed', error: null });
  });
});
