/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';

import { AppError } from '@shadow-library/common';
import { SQL } from 'bun';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

/**
 * Importing user defined packages
 */
import { CatalogService } from '@modules/ai/context/catalog.service';
import { ContextAssembler } from '@modules/ai/context/context-assembler.service';
import { WorkflowRunService } from '@modules/ai/graphs/workflow-run.service';
import { ModelRouterService } from '@modules/ai/model-router.service';
import { ProposalService } from '@modules/refinement/proposal.service';
import { RefineService } from '@modules/refinement/refine.service';
import { REQUIRED_BIBLE_DOCS } from '@modules/refinement/required-bible-docs';
import { createDatabaseFromTemplate } from '@scripts/create-template-db';
import { type PrimaryDatabase, schema } from '@server/database';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_refine`;

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
    return err instanceof AppError ? err.getCode() : String(err);
  }
}

const auditOutput = {
  findings: [
    { docRef: 'doc:project/reader-promise', action: 'keep', finding: 'clear and specific' },
    { docRef: 'doc:power/progression-ladder', action: 'add', finding: 'a cultivation story needs a visible ladder' },
  ],
  changeSet: [{ op: 'bible_document.upsert', section: 'power', slug: 'progression-ladder', body: 'Nine mortal ranks, then ascension.' }],
};

describe.if(pgAvailable)('RefineService', () => {
  let db: PrimaryDatabase;
  let refine: RefineService;
  let projectId: bigint;
  const llmInvoke = mock(async () => ({ content: JSON.stringify(auditOutput) }));

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const databaseService = { getPostgresClient: () => db } as never;
    const noop = {} as never;

    // Real router (repair ladder + llm_cache) with only the provider client mocked out.
    const modelRouter = new ModelRouterService(noop, databaseService);
    (modelRouter as unknown as Record<string, unknown>)['buildClient'] = () => ({ invoke: llmInvoke, pipe: () => ({ invoke: llmInvoke }) });

    const assembler = new ContextAssembler(databaseService, new CatalogService(databaseService));
    const workflowRuns = new WorkflowRunService(databaseService, noop, noop, noop, noop, noop);
    refine = new RefineService(databaseService, assembler, modelRouter, workflowRuns, new ProposalService(databaseService));

    const [project] = await db
      .insert(schema.projects)
      .values({ name: `refine-${Date.now()}`, kind: 'new_novel', brief: 'a cultivator returns from death to burn the sect that betrayed him' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    projectId = project.id;
    await db.insert(schema.bibleDocuments).values({ projectId, section: 'project', slug: 'reader-promise', body: 'Weekly power-ups.' });
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  it('stages a premise_enhance proposal with the rationale surfaced', async () => {
    llmInvoke.mockImplementationOnce(async () => ({
      content: JSON.stringify({
        enhancedPremise: 'Betrayed and executed, cultivator Wei Lin claws back from death with his enemies memories.',
        hook: 'he attends his own funeral in chapter one',
        stakes: 'every day alive is stolen — discovery means true death',
        protagonistDrive: 'burn the sect, rank by rank',
        progressionSystem: 'nine mortal ranks, each unlocked by consuming a betrayer memory',
        serializationNotes: 'one betrayer per arc; the ladder meters revenge into hundreds of chapters',
        genre: 'progression fantasy / revenge',
        themes: ['revenge', 'identity'],
        changeSet: [
          { op: 'premise.update', premise: 'Betrayed and executed, cultivator Wei Lin claws back from death.', themes: ['revenge', 'identity'] },
          { op: 'bible_document.upsert', section: 'project', slug: 'premise', body: 'Full enhanced premise.' },
        ],
      }),
    }));

    const result = await refine.enhancePremise(projectId);
    expect(result.rationale.hook).toContain('funeral');
    expect(result.proposal).toMatchObject({ kind: 'premise_enhance', status: 'pending', scopeType: 'novel' });
    expect(result.proposal.baseline).toHaveProperty('premise');

    const run = await db.query.workflowRuns.findFirst({ where: eq(schema.workflowRuns.id, result.runId) });
    expect(run).toMatchObject({ graph: 'premise-enhance', status: 'completed' });
  });

  it('rejects premise enhancement when no overview exists anywhere', async () => {
    const [bare] = await db
      .insert(schema.projects)
      .values({ name: `refine-bare-${Date.now()}`, kind: 'new_novel' })
      .returning();
    expect(await codeOf(refine.enhancePremise(bare?.id as bigint))).toBe('PRM_001');
  });

  it('stages an arc_plan proposal with exact coverage enforced through the repair ladder', async () => {
    await db.insert(schema.volumes).values([
      { projectId, volumeKey: 'v1', ordinal: 1, objective: 'trial', status: 'approved', targetChapterCount: 10, startChapter: 1, endChapter: 10 },
      { projectId, volumeKey: 'v2', ordinal: 2, objective: 'war', status: 'approved', targetChapterCount: 10, startChapter: 11, endChapter: 20 },
    ]);

    const arc = (arcKey: string, chapterStart: number, chapterEnd: number) => ({
      arcKey,
      title: 't',
      objective: 'o',
      escalation: 'e',
      payoff: 'p',
      hook: 'h',
      chapterStart,
      chapterEnd,
      cast: [],
      body: 'beats',
      ideas: ['a rival subplot'],
    });

    // First response leaves a gap → coverage postValidate rejects → ladder retries → good response.
    llmInvoke.mockImplementationOnce(async () => ({ content: JSON.stringify({ arcs: [arc('v1_a1', 1, 4), arc('v1_a2', 6, 10)] }) }));
    llmInvoke.mockImplementationOnce(async () => ({ content: JSON.stringify({ arcs: [arc('v1_a1', 1, 5), arc('v1_a2', 6, 10)] }) }));

    const result = await refine.planArcs(projectId, 'v1', { arcCount: 2 });
    expect(result.arcs).toHaveLength(2);
    expect(result.proposal).toMatchObject({ kind: 'arc_plan', status: 'pending', scopeType: 'arc_plan', scopeRef: 'volume:v1' });

    const ops = result.proposal.changeSet as { op: string; arcKey: string; body: string }[];
    expect(ops.every(op => op.op === 'arc.upsert')).toBe(true);
    expect(ops[0]?.body).toContain('Ideas:\n- a rival subplot');
  });

  it('rejects arc planning while the volume plan has draft volumes', async () => {
    const [gated] = await db
      .insert(schema.projects)
      .values({ name: `refine-gated-${Date.now()}`, kind: 'new_novel', brief: 'x' })
      .returning();
    await db.insert(schema.volumes).values({ projectId: gated?.id as bigint, volumeKey: 'v1', ordinal: 1, status: 'draft' });
    expect(await codeOf(refine.planArcs(gated?.id as bigint, 'v1'))).toBe('ARC_003');
  });

  it('stages a bible_audit proposal and serves the repeat audit from llm_cache', async () => {
    const callsBefore = llmInvoke.mock.calls.length;

    const first = await refine.auditBible(projectId);
    expect(first.findings).toHaveLength(2);
    expect(first.proposal).toMatchObject({ kind: 'bible_audit', status: 'pending' });
    expect(llmInvoke.mock.calls.length).toBe(callsBefore + 1);

    // Identical input + cacheable 'audit' role → served from llm_cache, no second model call.
    const second = await refine.auditBible(projectId);
    expect(second.findings).toHaveLength(2);
    expect(llmInvoke.mock.calls.length).toBe(callsBefore + 1);

    expect(REQUIRED_BIBLE_DOCS.some(doc => `${doc.section}/${doc.slug}` === 'power/progression-ladder')).toBe(true);
  });

  it('previews context packs for the refinement purposes without touching a model', async () => {
    const chat = await refine.previewContext(projectId, { purpose: 'chat', scopeType: 'volume', scopeRef: 'volume:v1' });
    expect(chat['purpose']).toBe('chat');
    expect(String(chat['renderedStable'])).toContain('trial');

    const arcPlan = await refine.previewContext(projectId, { purpose: 'arc_plan', volumeKey: 'v1' });
    expect(arcPlan['purpose']).toBe('arc_plan');

    const premise = await refine.previewContext(projectId, { purpose: 'premise' });
    expect(premise['purpose']).toBe('premise');
    expect(String(premise['rendered'])).toContain('cultivator');

    expect(await codeOf(refine.previewContext(projectId, { purpose: 'chat' }))).toBe('CHT_003');
  });
});
