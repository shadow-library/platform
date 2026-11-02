import { describe, expect, it } from 'bun:test';

import { ProposalService } from '@modules/refinement/proposal.service';

import { recordingDb } from '../recording-db';

function changesService(rows: Record<string, unknown>[]) {
  const recorded = recordingDb(() => rows);
  const db = { ...(recorded.db as object), $count: async () => rows.length };
  return { service: new ProposalService({ getPostgresClient: () => db } as never), queries: recorded.queries };
}

const change = (id: bigint, status: string, inverseCount: number) => ({
  id,
  sessionId: null,
  kind: 'hub',
  scopeType: 'project',
  status,
  summary: null,
  autoApplied: false,
  changeSet: [{ op: 'fact.upsert', factKey: `f${id}` }],
  opResults: null,
  appliedAt: new Date(0),
  revertedAt: null,
  inverseCount,
});

describe('ProposalService.listChanges', () => {
  it('should leave every change’s inverse ops, baseline and post-state unread, counting the inverse ops in the query', async () => {
    const { service, queries } = changesService([]);

    await service.listChanges(7n, {});

    expect(queries).toHaveLength(1);
    const [selected] = (queries[0]?.sql ?? '').split(' from ');
    expect(selected).toContain('jsonb_array_length("inverse_ops")');
    for (const column of ['baseline', 'post_state', 'op_undo', 'organise_record', 'diagnostics']) expect(selected).not.toContain(`"${column}"`);
  });

  it('should offer a revert only for an applied change that recorded inverse ops', async () => {
    const { service } = changesService([change(3n, 'applied', 2), change(2n, 'applied', 0), change(1n, 'reverted', 1)]);

    const result = await service.listChanges(7n, {});

    expect(result.items.map(item => [item.id, item.revertible, item.refs])).toEqual([
      [3n, true, ['fact:f3']],
      [2n, false, ['fact:f2']],
      [1n, false, ['fact:f1']],
    ]);
  });
});
