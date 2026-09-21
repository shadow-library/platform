import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sql';
import { AppError } from '@shadow-library/common';

import { ActionExecutorRegistry, type ChangeOp, ProposalApplyService, ProposalService } from '@modules/refinement';
import { type PrimaryDatabase, type Refinement, schema } from '@server/database';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_approval_actions_never_auto`;

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

describe.if(pgAvailable)('action.approve_draft / action.approve_volume_plan / action.approve_arcs are never auto-applied', () => {
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

    actionRegistry.register('action.approve_draft', async () => ({ summary: 'approved chapter 1 draft' }));
    actionRegistry.register('action.approve_volume_plan', async () => ({ summary: 'approved the volume plan' }));
    actionRegistry.register('action.approve_arcs', async () => ({ summary: 'approved arcs of vol_1' }));

    const [project] = await db
      .insert(schema.projects)
      .values({ name: `approval-gate-${Date.now()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    projectId = project.id;
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  function stage(op: ChangeOp): Promise<Refinement.Proposal> {
    return proposals.create(projectId, { scopeType: 'novel', kind: 'chat', summary: 'chat turn', changeSet: [op], allowedOps: [op.op] });
  }

  const cases: { op: ChangeOp; code: string }[] = [
    { op: { op: 'action.approve_draft', chapter: 1 }, code: 'DRF_009' },
    { op: { op: 'action.approve_volume_plan' }, code: 'PLN_003' },
    { op: { op: 'action.approve_arcs', volumeKey: 'vol_1' }, code: 'ARC_005' },
  ];

  for (const { op, code } of cases) {
    describe(op.op, () => {
      it(`should decline itself in an auto-mode turn with the ${code} note, leaving the proposal pending`, async () => {
        const proposal = await stage(op);

        const applied = await applier.apply(projectId, proposal.id, { autoApplied: true });

        expect(applied.opResults[0]).toMatchObject({ index: 0, status: 'declined' });
        expect(applied.opResults[0]?.note).toContain('never applied automatically');
        const reloaded = await proposals.get(projectId, proposal.id);
        expect(reloaded.status).toBe('pending');
      });

      it(`should refuse a blanket manual apply that never selected it (${code})`, async () => {
        const proposal = await stage(op);

        expect(await codeOf(applier.apply(projectId, proposal.id))).toBe(code);
        const reloaded = await proposals.get(projectId, proposal.id);
        expect(reloaded.status).toBe('pending');
      });

      it('should apply when the author selects the op themselves', async () => {
        const proposal = await stage(op);

        const applied = await applier.apply(projectId, proposal.id, { opIndexes: [0] });

        expect(applied.opResults[0]?.status).toBe('applied');
        const reloaded = await proposals.get(projectId, proposal.id);
        expect(reloaded.status).toBe('applied');
      });
    });
  }
});
