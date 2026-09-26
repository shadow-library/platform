import { describe, expect, it } from 'bun:test';

import { schema } from '@server/database';

import { emptyPlanOp } from '@modules/actions/chapter-plan';
import { type ChangeOp } from '@modules/refinement/change-set';
import { ProposalService } from '@modules/refinement/proposal.service';

import { planTables } from '../knowledge/plan-tables';

function staging() {
  const tables = planTables();
  const service = new ProposalService({ getPostgresClient: () => tables.db } as never);
  const pending = (id: bigint): void => void Object.assign(tables.rows(schema.refinementProposals).find(row => row['id'] === id) ?? {}, { status: 'pending' });
  return { service, pending };
}

const marked = (ops: unknown): unknown[] => (ops as ChangeOp[]).map(op => op.startedEmpty);

describe('ProposalService — the started-empty mark', () => {
  it('should drop the mark from a model’s ops in chat staging', async () => {
    const { service } = staging();

    const card = await service.create(7n, { scopeType: 'novel', kind: 'chat', changeSet: [{ op: 'brief.update', chapter: 4, body: 'x', startedEmpty: true }] });

    expect(marked(card.changeSet)).toEqual([undefined]);
  });

  it('should keep the mark on the server’s empty plan through an author edit, and never take one from the author', async () => {
    const { service, pending } = staging();
    const empty = await service.create(7n, { scopeType: 'novel', kind: 'chapter_plan', changeSet: [emptyPlanOp({ chapter: 4, steer: null })], allowedOps: ['brief.update'] });
    const planned = await service.create(7n, {
      scopeType: 'novel',
      kind: 'chapter_plan',
      changeSet: [{ op: 'brief.update', chapter: 5, body: 'Plan.' }],
      allowedOps: ['brief.update'],
    });
    pending(empty.id);
    pending(planned.id);

    const edited = await service.updateChangeSet(7n, empty.id, [{ op: 'brief.update', chapter: 4, body: 'Mara leaves.' }]);
    const forged = await service.updateChangeSet(7n, planned.id, [{ op: 'brief.update', chapter: 5, body: 'Plan.', startedEmpty: true }]);

    expect(marked(empty.changeSet)).toEqual([true]);
    expect(marked(edited.changeSet)).toEqual([true]);
    expect(marked(forged.changeSet)).toEqual([undefined]);
  });
});
