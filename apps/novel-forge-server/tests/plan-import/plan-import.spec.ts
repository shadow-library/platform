/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { AppError, ValidationError } from '@shadow-library/common';
import { SQL } from 'bun';
import { and, asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

/**
 * Importing user defined packages
 */
import { type ImportPlanBody, type PlanBundle } from '@modules/plan-import/plan-import.dto';
import { PlanImportService } from '@modules/plan-import/plan-import.service';
import { createDatabaseFromTemplate } from '@scripts/create-template-db';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_plan_import`;

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

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'NO_ERROR';
  } catch (err) {
    return err instanceof AppError ? err.code : String(err);
  }
}

function buildBundle(): PlanBundle {
  return {
    format: 'novel-forge-plan',
    version: 1,
    bible: [
      { section: 'project', slug: 'premise', body: 'A gravekeeper inherits a dead god.', frontmatter: { genre: 'dark fantasy' } },
      { section: 'plot', slug: 'ending-vision', body: 'The god stays dead; the keeper does not.' },
    ],
    entities: [
      { entityKey: 'mara', type: 'character', name: 'Mara', significance: 'major', motivation: 'keep the grave sealed' },
      { entityKey: 'iron_covenant', type: 'faction', name: 'Iron Covenant', notes: 'wants the god awake' },
    ],
    volumes: [
      {
        volumeKey: 'v1',
        ordinal: 1,
        title: 'The Seal',
        objective: 'establish the grave',
        conflict: 'covenant probes',
        payoff: 'first crack',
        targetChapterCount: 4,
        cast: ['mara'],
      },
      { volumeKey: 'v2', ordinal: 2, title: 'The Crack', objective: 'escalate', conflict: 'open siege', payoff: 'seal breaks', targetChapterCount: 3 },
    ],
    arcs: [
      {
        arcKey: 'v1_a1',
        volumeKey: 'v1',
        ordinal: 1,
        title: 'Quiet Rites',
        objective: 'routine',
        escalation: 'omen',
        payoff: 'intruder',
        hook: 'a knock below',
        chapterStart: 1,
        chapterEnd: 2,
      },
      {
        arcKey: 'v1_a2',
        volumeKey: 'v1',
        ordinal: 2,
        title: 'First Blood',
        objective: 'defend',
        escalation: 'siege',
        payoff: 'crack',
        hook: 'the god stirs',
        chapterStart: 3,
        chapterEnd: 4,
      },
    ],
    briefs: [1, 2, 3, 4, 5, 6, 7].map(chapter => ({
      chapter,
      volumeKey: chapter <= 4 ? 'v1' : 'v2',
      arcKey: chapter <= 2 ? 'v1_a1' : chapter <= 4 ? 'v1_a2' : undefined,
      title: `Chapter ${chapter}`,
      objective: `objective ${chapter}`,
      events: [`event ${chapter}a`, `event ${chapter}b`],
      requiredContext: ['entity:mara'],
      continuesIntoNextChapter: chapter !== 7,
      handoffBeat: chapter !== 7 ? `handoff ${chapter}` : undefined,
      endingContract: { hookType: 'cliffhanger', emotionalBeat: 'dread', openQuestion: `what next ${chapter}`, handoffState: `state ${chapter}` },
    })),
  } as PlanBundle;
}

function buildV2Bundle(): PlanBundle {
  const bundle = buildBundle();
  bundle.version = 2;
  bundle.facts = [
    { factKey: 'ledger_forgery', text: 'The ledger is a forgery.', subjects: ['mara'], constraintNote: 'Mara avoids the study.', terms: ['forgery'], revealChapter: 2 },
    { factKey: 'motive_debt', text: 'The covenant paymaster is broke.', terms: ['gambling debt'] },
  ];
  const brief = bundle.briefs?.find(b => b.chapter === 2);
  if (brief) brief.knowledgeContract = { pov: ['mara'], learns: [{ entityKey: 'mara', factKey: 'ledger_forgery' }] };
  return bundle;
}

describe.if(pgAvailable)('plan import', () => {
  let db: PrimaryDatabase;
  let service: PlanImportService;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const databaseService = { getPostgresClient: () => db, translateError: (err: unknown) => Promise.reject(err) } as never;
    service = new PlanImportService(databaseService);
  });

  // Leaving the pool open starves later spec files of connections and silently skips their suites.
  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  async function createProject(kind: 'new_novel' | 'source' = 'new_novel'): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `import-${Date.now()}-${Math.random()}`, kind })
      .returning();
    if (!project) throw new Error('failed to seed project');
    // Mirror ProjectService.create: new novels are born with contentless `<section>/default`
    // placeholder docs, and the import guards must see through them.
    if (kind === 'new_novel') {
      await db.insert(schema.bibleDocuments).values(schema.bibleSection.enumValues.map(section => ({ projectId: project.id, section, slug: 'default' })));
    }
    return project.id;
  }

  it('should import a full bundle into an empty project', async () => {
    const projectId = await createProject();
    const response = await service.import(projectId, { bundle: buildBundle() });

    expect(response.results).toEqual({
      bible: { created: 2, updated: 0, unchanged: 0, pruned: 0 },
      entities: { created: 2, updated: 0, unchanged: 0, pruned: 0 },
      facts: { created: 0, updated: 0, unchanged: 0, pruned: 0 },
      volumes: { created: 2, updated: 0, unchanged: 0, pruned: 0 },
      arcs: { created: 2, updated: 0, unchanged: 0, pruned: 0 },
      briefs: { created: 7, updated: 0, unchanged: 0, pruned: 0 },
    });
    expect(response.approval).toBeUndefined();
    expect(response.warnings).toEqual([]);

    const entity = await db.query.entities.findFirst({ where: eq(schema.entities.projectId, projectId) });
    expect(entity?.origin).toBe('seeded');

    const brief = await db.query.briefs.findFirst({ where: eq(schema.briefs.projectId, projectId), orderBy: asc(schema.briefs.chapter) });
    expect(brief?.body).toBe("objective 1\nevent 1a\nevent 1b\n[CONTINUES INTO NEXT CHAPTER] Do not resolve this chapter's central action/tension.\nHandoff beat: handoff 1");
    expect(brief?.contextRefs).toEqual(['entity:mara']);
    expect((brief?.endingContract as { hookType: string }).hookType).toBe('cliffhanger');

    const volumes = await db.query.volumes.findMany({ where: eq(schema.volumes.projectId, projectId) });
    expect(volumes.every(v => v.status === 'draft' && v.startChapter === null)).toBe(true);
  });

  it('should be idempotent — re-importing the same bundle with overwrite changes nothing', async () => {
    const projectId = await createProject();
    await service.import(projectId, { bundle: buildBundle() });
    const again = await service.import(projectId, { bundle: buildBundle(), overwrite: true });

    for (const counts of Object.values(again.results)) expect(counts).toEqual({ created: 0, updated: 0, unchanged: expect.any(Number), pruned: 0 });
    const volume = await db.query.volumes.findFirst({ where: eq(schema.volumes.projectId, projectId) });
    expect(volume?.revision).toBe(1);
  });

  it('should reject a second import without overwrite', async () => {
    const projectId = await createProject();
    await service.import(projectId, { bundle: buildBundle() });
    expect(await codeOf(service.import(projectId, { bundle: buildBundle() }))).toBe('IMP_001');
  });

  it('should update changed rows and prune rows missing from an overwrite bundle', async () => {
    const projectId = await createProject();
    await service.import(projectId, { bundle: buildBundle() });

    const smaller = buildBundle();
    smaller.volumes = smaller.volumes?.filter(v => v.volumeKey === 'v1');
    smaller.briefs = smaller.briefs?.filter(b => b.chapter <= 4);
    const survivor = smaller.volumes?.[0];
    if (survivor) survivor.objective = 'establish the grave, louder';

    const response = await service.import(projectId, { bundle: smaller, overwrite: true });
    expect(response.results.volumes).toEqual({ created: 0, updated: 1, unchanged: 0, pruned: 1 });
    expect(response.results.briefs).toEqual({ created: 0, updated: 0, unchanged: 4, pruned: 3 });

    const volumes = await db.query.volumes.findMany({ where: eq(schema.volumes.projectId, projectId) });
    expect(volumes).toHaveLength(1);
    expect(volumes[0]?.revision).toBe(2);
    expect(volumes[0]?.objective).toBe('establish the grave, louder');
  });

  it('should approve volumes with cumulative ranges and arc-bearing volumes in one call', async () => {
    const projectId = await createProject();
    const response = await service.import(projectId, { bundle: buildBundle(), approve: true });
    expect(response.approval).toEqual({ volumesApproved: 2, arcsApproved: 2 });

    const volumes = await db.query.volumes.findMany({ where: eq(schema.volumes.projectId, projectId), orderBy: asc(schema.volumes.ordinal) });
    expect(volumes.map(v => [v.status, v.startChapter, v.endChapter])).toEqual([
      ['approved', 1, 4],
      ['approved', 5, 7],
    ]);

    const arcs = await db.query.arcs.findMany({ where: eq(schema.arcs.projectId, projectId) });
    expect(arcs.every(a => a.status === 'approved')).toBe(true);
  });

  it('should leave placeholder docs and app-managed sections alone when pruning', async () => {
    const projectId = await createProject();
    await db
      .update(schema.bibleDocuments)
      .set({ body: 'extraction state', contentHash: 'hash' })
      .where(and(eq(schema.bibleDocuments.projectId, projectId), eq(schema.bibleDocuments.section, 'story_state')));

    const response = await service.import(projectId, { bundle: buildBundle(), overwrite: true });
    expect(response.results.bible).toEqual({ created: 2, updated: 0, unchanged: 0, pruned: 0 });

    const docs = await db.query.bibleDocuments.findMany({ where: eq(schema.bibleDocuments.projectId, projectId) });
    expect(docs).toHaveLength(schema.bibleSection.enumValues.length + 2);
    expect(docs.some(d => d.section === 'story_state' && d.body === 'extraction state')).toBe(true);
  });

  it('should refuse overwrite once drafts exist', async () => {
    const projectId = await createProject();
    await service.import(projectId, { bundle: buildBundle() });
    await db.insert(schema.drafts).values({ projectId, chapter: 1, body: 'prose' });
    expect(await codeOf(service.import(projectId, { bundle: buildBundle(), overwrite: true }))).toBe('IMP_003');
  });

  it('should reject source projects, unknown projects, and unsupported bundle versions', async () => {
    const sourceId = await createProject('source');
    expect(await codeOf(service.import(sourceId, { bundle: buildBundle() }))).toBe('PRJ_003');
    expect(await codeOf(service.import(999999999n, { bundle: buildBundle() }))).toBe('PRJ_001');

    const projectId = await createProject();
    const stale = { ...buildBundle(), version: 3 };
    expect(await codeOf(service.import(projectId, { bundle: stale }))).toBe('IMP_002');
  });

  it('should import v2 facts and knowledge contracts, idempotently, and prune facts on overwrite', async () => {
    const projectId = await createProject();
    const bundle = buildV2Bundle();
    const response = await service.import(projectId, { bundle });
    expect(response.results.facts).toEqual({ created: 2, updated: 0, unchanged: 0, pruned: 0 });
    expect(response.warnings).toEqual(["fact 'motive_debt' is never revealed by any brief in this bundle — it stays hidden until a later plan or a manual reveal"]);

    const fact = await db.query.canonFacts.findFirst({ where: and(eq(schema.canonFacts.projectId, projectId), eq(schema.canonFacts.factKey, 'ledger_forgery')) });
    expect(fact).toMatchObject({ text: 'The ledger is a forgery.', constraintNote: 'Mara avoids the study.', terms: ['forgery'] });

    const brief = await db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, 2)) });
    expect(brief?.knowledgeContract).toEqual({ pov: ['mara'], learns: [{ entityKey: 'mara', factKey: 'ledger_forgery' }] });

    const again = await service.import(projectId, { bundle: buildV2Bundle(), overwrite: true });
    expect(again.results.facts).toEqual({ created: 0, updated: 0, unchanged: 2, pruned: 0 });
    expect(again.results.briefs.created + again.results.briefs.updated).toBe(0);

    const smaller = buildV2Bundle();
    smaller.facts = smaller.facts?.filter(f => f.factKey === 'ledger_forgery');
    const pruning = await service.import(projectId, { bundle: smaller, overwrite: true });
    expect(pruning.results.facts).toEqual({ created: 0, updated: 0, unchanged: 1, pruned: 1 });
  });

  it('should reject a knowledge contract revealing an unknown fact and write nothing', async () => {
    const projectId = await createProject();
    const bundle = buildV2Bundle();
    const brief = bundle.briefs?.find(b => b.chapter === 2);
    if (brief?.knowledgeContract?.learns?.[0]) brief.knowledgeContract.learns[0].factKey = 'ghost_fact';

    const error = await service.import(projectId, { bundle }).then(
      () => null,
      err => err,
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect(await db.$count(schema.canonFacts, eq(schema.canonFacts.projectId, projectId))).toBe(0);
  });

  it('should surface cross-item problems as a ValidationError and write nothing', async () => {
    const projectId = await createProject();
    const broken = buildBundle();
    const secondArc = broken.arcs?.[1];
    if (secondArc) secondArc.chapterStart = 4;

    const error = await service.import(projectId, { bundle: broken } as ImportPlanBody).then(
      () => null,
      err => err,
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).getErrorCount()).toBeGreaterThan(0);
    expect(await db.$count(schema.volumes, eq(schema.volumes.projectId, projectId))).toBe(0);
  });
});
