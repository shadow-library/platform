import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_reforge_transform_schema`;

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

async function violatedConstraint(query: Promise<unknown>): Promise<string> {
  const error = await query.then(
    () => null,
    (e: Error) => e,
  );
  if (!error) throw new Error('expected query to be rejected');
  return String(error.cause ?? error.message);
}

describe.if(pgAvailable)('reforge transform schemas', () => {
  let db: PrimaryDatabase;
  let projectId: bigint;
  let analysisId: bigint;
  let planId: bigint;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `reforge-transform-${Date.now()}`, kind: 'source' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    projectId = project.id;

    const [analysis] = await db.insert(schema.reforgeAnalyses).values({ projectId }).returning();
    if (!analysis) throw new Error('failed to seed analysis');
    analysisId = analysis.id;

    const [plan] = await db.insert(schema.reforgePlans).values({ projectId, analysisId, sourceChapterCount: 40 }).returning();
    if (!plan) throw new Error('failed to seed plan');
    planId = plan.id;
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  it('should default the reforge mode to chapter so existing rows keep the 1:1 path', async () => {
    const [reforge] = await db.insert(schema.reforges).values({ projectId }).returning();
    expect(reforge).toMatchObject({ mode: 'chapter', fidelity: 'preserve', status: 'pending' });
  });

  it('should default analysis columns', async () => {
    const [analysis] = await db.select().from(schema.reforgeAnalyses).where(eq(schema.reforgeAnalyses.id, analysisId));
    expect(analysis).toMatchObject({ status: 'pending', windowSize: 15, chaptersAnalyzed: 0, windowsFailed: 0, report: null, metrics: null });
  });

  it('should enforce one card per source chapter of an analysis', async () => {
    const card = { summary: 'the duel resumes', pov: 'Ren', cast: ['Ren'], movement: 'stalls' as const, threadsOpened: [], threadsAdvanced: [], threadsClosed: [] };
    await db.insert(schema.reforgeChapterCards).values({ analysisId, chapter: 7, card, movement: 'stalls' });

    const duplicate = db.insert(schema.reforgeChapterCards).values({ analysisId, chapter: 7, card, movement: 'advances' }).execute();
    expect(await violatedConstraint(duplicate)).toMatch(/reforge_chapter_cards_analysis_id_chapter_unique/);
  });

  it('should round-trip a finding with its evidence', async () => {
    const [finding] = await db
      .insert(schema.reforgeFindings)
      .values({
        analysisId,
        type: 'repetition',
        fromChapter: 12,
        toChapter: 26,
        severity: 4,
        confidence: 0.75,
        detectedBy: 'both',
        label: 'tournament fight pattern repeats',
        evidence: { shingles: ['he raised his blade'] },
      })
      .returning();
    expect(finding).toMatchObject({ type: 'repetition', detectedBy: 'both', severity: 4, evidence: { shingles: ['he raised his blade'] } });
    expect(finding?.confidence).toBeCloseTo(0.75, 5);
  });

  it('should enforce one plan per project revision', async () => {
    const duplicate = db.insert(schema.reforgePlans).values({ projectId, sourceChapterCount: 40 }).execute();
    expect(await violatedConstraint(duplicate)).toMatch(/reforge_plans_project_id_revision_unique/);
  });

  it('should enforce a unique ordinal and span key per plan', async () => {
    const span = { planId, ordinal: 1, spanKey: 'span-a', fromChapter: 1, toChapter: 6, action: 'condense' as const, targetChapters: 2 };
    await db.insert(schema.reforgePlanSpans).values(span);

    const duplicateOrdinal = db
      .insert(schema.reforgePlanSpans)
      .values({ ...span, spanKey: 'span-b' })
      .execute();
    expect(await violatedConstraint(duplicateOrdinal)).toMatch(/reforge_plan_spans_plan_id_ordinal_unique/);

    const duplicateKey = db
      .insert(schema.reforgePlanSpans)
      .values({ ...span, ordinal: 2 })
      .execute();
    expect(await violatedConstraint(duplicateKey)).toMatch(/reforge_plan_spans_plan_id_span_key_unique/);
  });

  it('should key outputs on the plan rather than the source chapter', async () => {
    const output = {
      projectId,
      planId,
      outputChapter: 1,
      spanOrdinal: 1,
      spanKey: 'span-a',
      fromChapter: 1,
      toChapter: 6,
      indexInSpan: 0,
      body: 'prose',
      status: 'written' as const,
    };
    const [row] = await db.insert(schema.reforgeOutputs).values(output).returning();
    expect(row).toMatchObject({ revision: 1, status: 'written', planBeats: null, cutDelta: null });

    const duplicate = db
      .insert(schema.reforgeOutputs)
      .values({ ...output, indexInSpan: 1 })
      .execute();
    expect(await violatedConstraint(duplicate)).toMatch(/reforge_outputs_plan_chapter_unique/);
  });

  it('should keep the first description of a cut when the ledger is appended to again', async () => {
    const entry = {
      planId,
      cutKey: 'azure-sect-tribunal',
      kind: 'subplot' as const,
      label: 'the Azure Sect tribunal subplot',
      aliases: ['Azure Sect', 'tribunal'],
      detail: 'a 14-chapter trial that resolves nothing',
      originSpanOrdinal: 1,
      firstSourceChapter: 12,
      lastSourceChapter: 26,
      effectiveFromOutput: 3,
    };
    await db.insert(schema.reforgeCuts).values(entry);
    await db
      .insert(schema.reforgeCuts)
      .values({ ...entry, detail: 'a different description' })
      .onConflictDoNothing();

    const rows = await db.select().from(schema.reforgeCuts).where(eq(schema.reforgeCuts.planId, planId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ disposition: 'cut', detail: 'a 14-chapter trial that resolves nothing' });
  });

  it('should cascade transform rows when the project is deleted', async () => {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `reforge-transform-cascade-${Date.now()}`, kind: 'source' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    const [analysis] = await db.insert(schema.reforgeAnalyses).values({ projectId: project.id }).returning();
    const [plan] = await db.insert(schema.reforgePlans).values({ projectId: project.id, sourceChapterCount: 4 }).returning();
    if (!analysis || !plan) throw new Error('failed to seed cascade fixtures');
    await db.insert(schema.reforgeFindings).values({
      analysisId: analysis.id,
      type: 'filler',
      fromChapter: 1,
      toChapter: 2,
      severity: 2,
      confidence: 0.4,
      detectedBy: 'signal',
      label: 'padding',
    });
    await db.insert(schema.reforgePlanSpans).values({ planId: plan.id, ordinal: 1, spanKey: 'k', fromChapter: 1, toChapter: 4, action: 'keep', targetChapters: 4 });

    await db.delete(schema.projects).where(eq(schema.projects.id, project.id));

    expect(await db.select().from(schema.reforgeAnalyses).where(eq(schema.reforgeAnalyses.projectId, project.id))).toHaveLength(0);
    expect(await db.select().from(schema.reforgeFindings).where(eq(schema.reforgeFindings.analysisId, analysis.id))).toHaveLength(0);
    expect(await db.select().from(schema.reforgePlanSpans).where(eq(schema.reforgePlanSpans.planId, plan.id))).toHaveLength(0);
  });
});
