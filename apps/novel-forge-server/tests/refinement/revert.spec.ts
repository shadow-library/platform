/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

/**
 * Importing user defined packages
 */
import { ActionExecutorRegistry, type ChangeOp, changeSetRefs, loadArtifactStates, ProposalApplyService, ProposalService } from '@modules/refinement';
import { computeBibleDocHash } from '@server/common';
import { type PrimaryDatabase, type Refinement, schema } from '@server/database';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_revert`;

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

describe.if(pgAvailable)('apply engine v2: cherry-pick, actions, revert, rollback', () => {
  let db: PrimaryDatabase;
  let proposals: ProposalService;
  let applier: ProposalApplyService;
  let projectId: bigint;

  const databaseService = () => ({ getPostgresClient: () => db }) as never;
  const registry = new ActionExecutorRegistry();

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    proposals = new ProposalService(databaseService());
    applier = new ProposalApplyService(databaseService(), registry);

    const [project] = await db
      .insert(schema.projects)
      .values({ name: `revert-${Date.now()}`, kind: 'new_novel', premise: 'original premise', brief: 'original brief' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    projectId = project.id;

    await db
      .insert(schema.bibleDocuments)
      .values({ projectId, section: 'project', slug: 'reader-promise', body: 'original promise', contentHash: computeBibleDocHash(undefined, 'original promise'), revision: 1 });
    await db.insert(schema.entities).values({ projectId, entityKey: 'hero', type: 'character', name: 'Hero', origin: 'seeded', motivation: 'original drive' });
    const [draftRow] = await db
      .insert(schema.drafts)
      .values({ projectId, chapter: 1, body: 'original prose', status: 'draft', revision: 1, reviewStatus: 'needs_review' })
      .returning();
    if (!draftRow) throw new Error('failed to seed draft');
  });

  // Leaving the pool open starves later spec files of connections and silently skips their suites.
  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  function createProposal(changeSet: ChangeOp[]): Promise<Refinement.Proposal> {
    return proposals.create(projectId, { scopeType: 'project', kind: 'hub', changeSet });
  }

  it('should cherry-pick: apply only selected ops, record dispositions, and audit declines', async () => {
    const proposal = await createProposal([
      { op: 'premise.update', premise: 'cherry-picked premise' },
      { op: 'bible_document.upsert', section: 'project', slug: 'reader-promise', body: 'must not land' },
    ]);

    const result = await applier.apply(projectId, proposal.id, { opIndexes: [0] });
    expect(result.opResults).toEqual([
      { index: 0, status: 'applied' },
      { index: 1, status: 'declined' },
    ]);

    const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    expect(project?.premise).toBe('cherry-picked premise');
    const doc = await db.query.bibleDocuments.findFirst({
      where: and(eq(schema.bibleDocuments.projectId, projectId), eq(schema.bibleDocuments.slug, 'reader-promise')),
    });
    expect(doc?.body).toBe('original promise');

    const rejections = await db.query.userFeedback.findMany({
      where: and(eq(schema.userFeedback.projectId, projectId), eq(schema.userFeedback.artifactRef, String(proposal.id)), eq(schema.userFeedback.disposition, 'rejected')),
    });
    expect(rejections).toHaveLength(1);
    expect(rejections[0]?.note).toContain('declined ops: 1');
  });

  it('should reject invalid cherry-pick selections', async () => {
    const proposal = await createProposal([{ op: 'premise.update', premise: 'x' }]);
    await expect(applier.apply(projectId, proposal.id, { opIndexes: [5] })).rejects.toThrow(/Invalid op selection/);
    await expect(applier.apply(projectId, proposal.id, { opIndexes: [] })).rejects.toThrow(/Invalid op selection/);
    await proposals.discard(projectId, proposal.id);
  });

  it('should apply and revert the full op matrix back to byte-identical content', async () => {
    const changeSet: ChangeOp[] = [
      { op: 'premise.update', premise: 'rewritten premise' },
      { op: 'bible_document.upsert', section: 'project', slug: 'reader-promise', body: 'rewritten promise' },
      { op: 'bible_document.upsert', section: 'world', slug: 'new-doc', body: 'created doc' },
      { op: 'entity.upsert', entityKey: 'hero', type: 'character', motivation: 'rewritten drive' },
      { op: 'entity.upsert', entityKey: 'rival', type: 'character', name: 'Rival' },
      { op: 'volume.upsert', volumeKey: 'vol_new', ordinal: 1, objective: 'created volume' },
      { op: 'brief.update', chapter: 3, body: 'created brief' },
      { op: 'draft.update', chapter: 1, body: 'rewritten prose' },
    ];
    const refs = changeSetRefs(changeSet);
    const before = await loadArtifactStates(db, projectId, refs);

    const proposal = await createProposal(changeSet);
    const applied = await applier.apply(projectId, proposal.id);
    expect(applied.proposal.status).toBe('applied');
    expect((applied.proposal.inverseOps as ChangeOp[]).length).toBe(changeSet.length);

    const mid = await loadArtifactStates(db, projectId, refs);
    expect(mid['doc:world/new-doc']?.exists).toBe(true);
    expect(mid['draft:1']?.contentHash).not.toBe(before['draft:1']?.contentHash);

    const reverted = await applier.revert(projectId, proposal.id);
    expect(reverted.proposal.status).toBe('reverted');
    expect(reverted.proposal.revertedAt).not.toBeNull();

    const after = await loadArtifactStates(db, projectId, refs);
    for (const ref of refs) {
      expect({ ref, exists: after[ref]?.exists, contentHash: after[ref]?.contentHash }).toEqual({
        ref,
        exists: before[ref]?.exists ?? false,
        contentHash: before[ref]?.contentHash ?? null,
      });
    }
  });

  it('should refuse to revert when an artifact moved after the apply', async () => {
    const proposal = await createProposal([{ op: 'bible_document.upsert', section: 'project', slug: 'reader-promise', body: 'about to be overwritten' }]);
    await applier.apply(projectId, proposal.id);

    await db
      .update(schema.bibleDocuments)
      .set({ body: 'hand edit after apply', contentHash: 'moved-on', revision: 99 })
      .where(and(eq(schema.bibleDocuments.projectId, projectId), eq(schema.bibleDocuments.slug, 'reader-promise')));

    await expect(applier.revert(projectId, proposal.id)).rejects.toThrow(/Revert conflict/);
    const row = await db.query.refinementProposals.findFirst({ where: eq(schema.refinementProposals.id, proposal.id) });
    expect(row?.status).toBe('applied');
  });

  it('should refuse to revert pending or action-only proposals', async () => {
    const pending = await createProposal([{ op: 'premise.update', premise: 'never applied' }]);
    await expect(applier.revert(projectId, pending.id)).rejects.toThrow(/not revertible/);
    await proposals.discard(projectId, pending.id);

    registry.register('action.audit_bible', async () => ({ summary: 'audit ran' }));
    const actionOnly = await createProposal([{ op: 'action.audit_bible' }]);
    await applier.apply(projectId, actionOnly.id);
    await expect(applier.revert(projectId, actionOnly.id)).rejects.toThrow(/not revertible/);
  });

  it('should execute actions post-commit, record results, and fail fast on executor errors', async () => {
    registry.register('action.generate_chapters', async (_projectId, action) => {
      if (action.op !== 'action.generate_chapters') throw new Error('misrouted');
      return { summary: `enqueued ${action.count}`, jobId: 'job-42' };
    });
    registry.register('action.judge_draft', async () => {
      throw new Error('judge exploded');
    });
    registry.register('action.approve_draft', async () => ({ summary: 'never reached' }));

    const ok = await createProposal([
      { op: 'premise.update', premise: 'content plus action' },
      { op: 'action.generate_chapters', count: 2 },
    ]);
    const okResult = await applier.apply(projectId, ok.id);
    expect(okResult.opResults).toEqual([
      { index: 0, status: 'applied' },
      { index: 1, status: 'applied', result: { summary: 'enqueued 2', jobId: 'job-42' } },
    ]);

    const failing = await createProposal([
      { op: 'action.judge_draft', chapter: 1 },
      { op: 'action.approve_draft', chapter: 1 },
    ]);
    const failResult = await applier.apply(projectId, failing.id);
    expect(failResult.opResults[0]).toMatchObject({ status: 'failed', error: 'judge exploded' });
    expect(failResult.opResults[1]).toMatchObject({ status: 'failed', error: expect.stringContaining('skipped') });
    const failedRow = await db.query.refinementProposals.findFirst({ where: eq(schema.refinementProposals.id, failing.id) });
    expect(failedRow?.error).toMatchObject({ actionFailure: true });
  });

  it('should refuse unregistered actions before touching anything', async () => {
    const proposal = await createProposal([
      { op: 'premise.update', premise: 'must stay unapplied' },
      { op: 'action.plan_volumes', volumeCount: 3, chaptersPerVolume: 10 },
    ]);
    await expect(applier.apply(projectId, proposal.id)).rejects.toThrow(/Action execution failed/);
    const row = await db.query.refinementProposals.findFirst({ where: eq(schema.refinementProposals.id, proposal.id) });
    expect(row?.status).toBe('pending');
    await proposals.discard(projectId, proposal.id);
  });

  it('should never auto-apply finalize but allow it manually', async () => {
    registry.register('action.finalize', async () => ({ summary: 'finalized' }));
    const proposal = await createProposal([{ op: 'action.finalize', upTo: 1 }]);

    await expect(applier.apply(projectId, proposal.id, { autoApplied: true })).rejects.toThrow(/never auto-applied/);
    const still = await db.query.refinementProposals.findFirst({ where: eq(schema.refinementProposals.id, proposal.id) });
    expect(still?.status).toBe('pending');

    const manual = await applier.apply(projectId, proposal.id);
    expect(manual.opResults[0]).toMatchObject({ status: 'applied', result: { summary: 'finalized' } });
  });

  it('should roll back to a point, newest first, skipping action-only changes', async () => {
    const first = await createProposal([{ op: 'bible_document.upsert', section: 'plot', slug: 'escalation-map', body: 'v1' }]);
    await applier.apply(projectId, first.id);
    const second = await createProposal([{ op: 'bible_document.upsert', section: 'plot', slug: 'escalation-map', body: 'v2' }]);
    await applier.apply(projectId, second.id);
    const actionOnly = await createProposal([{ op: 'action.audit_bible' }]);
    await applier.apply(projectId, actionOnly.id);
    const third = await createProposal([{ op: 'bible_document.upsert', section: 'plot', slug: 'escalation-map', body: 'v3' }]);
    await applier.apply(projectId, third.id);

    const rollback = await applier.rollbackAfter(projectId, first.id);
    expect(rollback.reverted.map(r => r.proposalId)).toEqual([third.id, second.id]);
    expect(rollback.skipped).toEqual([actionOnly.id]);
    expect(rollback.stoppedAt).toBeUndefined();

    const doc = await db.query.bibleDocuments.findFirst({ where: and(eq(schema.bibleDocuments.projectId, projectId), eq(schema.bibleDocuments.slug, 'escalation-map')) });
    expect(doc?.body).toBe('v1');
  });

  it('should list the project change history with revertibility flags', async () => {
    const changes = await proposals.listChanges(projectId, {});
    expect(changes.items.length).toBeGreaterThan(0);
    const statuses = new Set(changes.items.map(c => c.status));
    expect([...statuses].every(s => s === 'applied' || s === 'reverted')).toBe(true);

    const reverted = changes.items.find(c => c.status === 'reverted');
    expect(reverted?.revertible).toBe(false);
    const actionOnly = changes.items.find(c => c.refs.length === 0);
    expect(actionOnly?.revertible).toBe(false);
  });
});
