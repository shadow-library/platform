import { describe, expect, it } from 'bun:test';

import { schema } from '@server/database';

import { ProposalService } from '@modules/refinement/proposal.service';

import { planTables } from '../knowledge/plan-tables';

function staged(status: string) {
  const tables = planTables();
  const row = { id: 9n, projectId: 7n, status, kind: 'chat', changeSet: [] };
  tables.rows(schema.refinementProposals).push(row);
  return { row, tables, service: new ProposalService({ getPostgresClient: () => tables.db } as never) };
}

describe('ProposalService.discard', () => {
  it('should discard a pending or conflicted card', async () => {
    expect((await staged('pending').service.discard(7n, 9n)).status).toBe('discarded');
    expect((await staged('conflicted').service.discard(7n, 9n)).status).toBe('discarded');
  });

  it('should refuse a card an apply settled between the read and the write, and leave it applied', async () => {
    const { row, tables, service } = staged('applied');
    tables.db.query.refinementProposals.findFirst = async () => ({ ...row, status: 'pending' });

    await expect(service.discard(7n, 9n)).rejects.toMatchObject({ code: 'RFN_002' });
    expect(row.status).toBe('applied');
  });
});
