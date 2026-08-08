import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { ActionExecutorRegistry, type ChangeOp, ProposalApplyService, ProposalService } from '@modules/refinement';
import { type PrimaryDatabase, type Refinement, schema } from '@server/database';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_proposal_apply`;

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

describe.if(pgAvailable)('proposal engine', () => {
  let db: PrimaryDatabase;
  let proposals: ProposalService;
  let applier: ProposalApplyService;
  let projectId: bigint;

  const databaseService = () => ({ getPostgresClient: () => db }) as never;
  const actionRegistry = new ActionExecutorRegistry();

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    proposals = new ProposalService(databaseService());
    applier = new ProposalApplyService(databaseService(), actionRegistry);

    const [project] = await db
      .insert(schema.projects)
      .values({ name: `proposal-apply-${Date.now()}`, kind: 'new_novel', premise: 'original premise', storyCurrentChapter: 2 })
      .returning();
    if (!project) throw new Error('failed to seed project');
    projectId = project.id;

    await db.insert(schema.volumes).values([
      { projectId, volumeKey: 'vol_1', ordinal: 1, objective: 'trial', status: 'approved', targetChapterCount: 6, startChapter: 1, endChapter: 6 },
      { projectId, volumeKey: 'vol_2', ordinal: 2, objective: 'war', status: 'approved', targetChapterCount: 6, startChapter: 7, endChapter: 12 },
      { projectId, volumeKey: 'vol_draft', ordinal: 3, objective: 'aftermath', status: 'draft' },
    ]);
    await db.insert(schema.arcs).values([
      { projectId, arcKey: 'vol_1_arc_1', volumeKey: 'vol_1', ordinal: 1, chapterStart: 1, chapterEnd: 6, status: 'approved' },
      { projectId, arcKey: 'vol_2_arc_1', volumeKey: 'vol_2', ordinal: 1, chapterStart: 7, chapterEnd: 12, status: 'draft' },
    ]);
    await db.insert(schema.briefs).values([
      { projectId, chapter: 2, volumeKey: 'vol_1', body: 'finalized brief' },
      { projectId, chapter: 5, volumeKey: 'vol_1', arcKey: 'vol_1_arc_1', body: 'brief five' },
    ]);
    await db.insert(schema.chapters).values({ projectId, number: 1, content: 'ch1', status: 'done' });
  });

  // Leaving the pool open starves later spec files of connections and silently skips their suites.
  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  function createProposal(changeSet: ChangeOp[], overrides: Partial<Parameters<ProposalService['create']>[1]> = {}): Promise<Refinement.Proposal> {
    return proposals.create(projectId, { scopeType: 'novel', kind: 'chat', changeSet, ...overrides });
  }

  it('should apply a multi-op change-set atomically and record audit feedback', async () => {
    const proposal = await createProposal([
      { op: 'premise.update', premise: 'sharper premise' },
      { op: 'bible_document.upsert', section: 'project', slug: 'reader-promise', body: 'weekly escalation' },
      { op: 'brief.update', chapter: 5, body: 'sharper brief five' },
    ]);

    const result = await applier.apply(projectId, proposal.id);
    expect(result.proposal.status).toBe('applied');
    expect(result.applied).toEqual([
      { artifactRef: 'premise', newRevision: null },
      { artifactRef: 'doc:project/reader-promise', newRevision: 1 },
      { artifactRef: 'chapter:5', newRevision: 2 },
    ]);

    const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    expect(project?.premise).toBe('sharper premise');
    const brief = await db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, 5)) });
    expect(brief).toMatchObject({ body: 'sharper brief five', revision: 2 });
    const feedback = await db.query.userFeedback.findFirst({
      where: and(
        eq(schema.userFeedback.projectId, projectId),
        eq(schema.userFeedback.artifactType, 'refinement_proposal'),
        eq(schema.userFeedback.artifactRef, String(proposal.id)),
      ),
    });
    expect(feedback?.disposition).toBe('approved');
  });

  it('should conflict with 409 and persist mismatches when the artifact moved after proposal time', async () => {
    const proposal = await createProposal([{ op: 'volume.upsert', volumeKey: 'vol_draft', objective: 'rebuild the sect' }]);

    // Simulate a concurrent hand edit landing between proposal and apply.
    await db
      .update(schema.volumes)
      .set({ revision: 5, updatedAt: new Date() })
      .where(and(eq(schema.volumes.projectId, projectId), eq(schema.volumes.volumeKey, 'vol_draft')));

    await expect(applier.apply(projectId, proposal.id)).rejects.toThrow(/conflicts with the current artifact state/);
    const conflicted = await db.query.refinementProposals.findFirst({ where: eq(schema.refinementProposals.id, proposal.id) });
    expect(conflicted?.status).toBe('conflicted');
    expect((conflicted?.error as { mismatches: unknown[] }).mismatches).toHaveLength(1);

    // Conflicted proposals can only be discarded.
    await expect(applier.apply(projectId, proposal.id)).rejects.toThrow(/not pending/);
    const discarded = await proposals.discard(projectId, proposal.id);
    expect(discarded.status).toBe('discarded');
  });

  it('should roll back every write when a guard rail rejects one op', async () => {
    const proposal = await createProposal([
      { op: 'premise.update', premise: 'must not survive' },
      { op: 'brief.update', chapter: 2, body: 'editing a finalized chapter' },
    ]);

    await expect(applier.apply(projectId, proposal.id)).rejects.toThrow(/Finalized chapters are immutable/);

    const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    expect(project?.premise).not.toBe('must not survive');
    const untouched = await db.query.refinementProposals.findFirst({ where: eq(schema.refinementProposals.id, proposal.id) });
    expect(untouched?.status).toBe('pending');
    await proposals.discard(projectId, proposal.id);
  });

  it('should mark arcs stale on structural volume change and shift downstream ranges on count change', async () => {
    const proposal = await createProposal([{ op: 'volume.upsert', volumeKey: 'vol_1', objective: 'harsher trial', targetChapterCount: 8 }]);
    const result = await applier.apply(projectId, proposal.id);

    expect(result.staleMarked).toContain('arc:vol_1_arc_1');
    const vol1 = await db.query.volumes.findFirst({ where: and(eq(schema.volumes.projectId, projectId), eq(schema.volumes.volumeKey, 'vol_1')) });
    expect(vol1).toMatchObject({ startChapter: 1, endChapter: 8 });
    const vol2 = await db.query.volumes.findFirst({ where: and(eq(schema.volumes.projectId, projectId), eq(schema.volumes.volumeKey, 'vol_2')) });
    expect(vol2).toMatchObject({ startChapter: 9, endChapter: 14 });
    const vol2Arc = await db.query.arcs.findFirst({ where: and(eq(schema.arcs.projectId, projectId), eq(schema.arcs.arcKey, 'vol_2_arc_1')) });
    expect(vol2Arc?.staleReason).toBe('volume_range_shifted');
  });

  it('should mark briefs stale when their arc changes and reject arcs escaping the volume range', async () => {
    const proposal = await createProposal([{ op: 'arc.upsert', arcKey: 'vol_1_arc_1', volumeKey: 'vol_1', escalation: 'rival sect intervenes' }]);
    const result = await applier.apply(projectId, proposal.id);
    expect(result.staleMarked).toContain('chapter:5');

    const escaping = await createProposal([{ op: 'arc.upsert', arcKey: 'vol_1_arc_1', volumeKey: 'vol_1', chapterStart: 1, chapterEnd: 99 }]);
    await expect(applier.apply(projectId, escaping.id)).rejects.toThrow(/exactly cover the volume chapter range/);
    await proposals.discard(projectId, escaping.id);
  });

  it('should refuse removes on non-draft rows and allow them on drafts', async () => {
    const onApproved = await createProposal([{ op: 'arc.remove', arcKey: 'vol_1_arc_1' }]);
    await expect(applier.apply(projectId, onApproved.id)).rejects.toThrow(/not allowed for this scope/);
    await proposals.discard(projectId, onApproved.id);

    await db.insert(schema.arcs).values({ projectId, arcKey: 'vol_1_arc_tmp', volumeKey: 'vol_1', status: 'draft' });
    const onDraft = await createProposal([{ op: 'arc.remove', arcKey: 'vol_1_arc_tmp' }]);
    await applier.apply(projectId, onDraft.id);
    const gone = await db.query.arcs.findFirst({ where: and(eq(schema.arcs.projectId, projectId), eq(schema.arcs.arcKey, 'vol_1_arc_tmp')) });
    expect(gone).toBeUndefined();
  });

  it('should supersede overlapping pending proposals within the same session', async () => {
    const [session] = await db.insert(schema.chatSessions).values({ projectId, scopeType: 'volume_plan' }).returning();
    if (!session) throw new Error('failed to seed session');

    const first = await createProposal([{ op: 'volume.upsert', volumeKey: 'vol_draft', objective: 'v1' }], { sessionId: session.id, scopeType: 'volume_plan' });
    const unrelated = await createProposal([{ op: 'premise.update', premise: 'unrelated' }], { sessionId: session.id, scopeType: 'volume_plan' });
    const second = await createProposal([{ op: 'volume.upsert', volumeKey: 'vol_draft', payoff: 'v2' }], { sessionId: session.id, scopeType: 'volume_plan' });

    const firstRow = await db.query.refinementProposals.findFirst({ where: eq(schema.refinementProposals.id, first.id) });
    expect(firstRow?.status).toBe('superseded');
    const unrelatedRow = await db.query.refinementProposals.findFirst({ where: eq(schema.refinementProposals.id, unrelated.id) });
    expect(unrelatedRow?.status).toBe('pending');
    const secondRow = await db.query.refinementProposals.findFirst({ where: eq(schema.refinementProposals.id, second.id) });
    expect(secondRow?.status).toBe('pending');
  });

  it('should re-validate and re-baseline hand edits, and reject invalid ones', async () => {
    const proposal = await createProposal([{ op: 'volume.upsert', volumeKey: 'vol_draft', objective: 'before edit' }]);

    await expect(proposals.updateChangeSet(projectId, proposal.id, [{ op: 'volume.explode', volumeKey: 'vol_draft' }])).rejects.toThrow(/not allowed for this scope/);

    const updated = await proposals.updateChangeSet(projectId, proposal.id, [{ op: 'brief.update', chapter: 5, title: 'edited by hand' }]);
    expect(Object.keys(updated.baseline as Record<string, unknown>)).toEqual(['chapter:5']);
    await proposals.discard(projectId, proposal.id);
  });
});
