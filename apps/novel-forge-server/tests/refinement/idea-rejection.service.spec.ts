import { describe, expect, it } from 'bun:test';

import { type Ledger } from '@server/database';

import { type NewLedgerEntry, type SupersedingEntry } from '@modules/ledger/ledger.types';
import { type ChangeOp } from '@modules/refinement/change-set';
import { ideaIdOf } from '@modules/refinement/idea-id';
import { IdeaRejectionService } from '@modules/refinement/idea-rejection.service';

import { ledgerEntry } from '../ledger/ledger-fixtures';

const kael: ChangeOp = { op: 'entity.upsert', entityKey: 'kael', type: 'character', name: 'Kael', motivation: 'He wants the lamp.' };
const secret: ChangeOp = { op: 'fact.upsert', factKey: 'kael_betrayal', body: 'Kael sold the keeper out.' };
const rule: ChangeOp = { op: 'organise.rule', rule: 'No magic at sea.', optionId: 'r1' };

function fakeRejections(options: { active?: Ledger.Entry; activeVolume?: string; racedBy?: Ledger.Entry } = {}) {
  const appended: NewLedgerEntry[] = [];
  const superseded: { entryId: bigint; next: SupersedingEntry }[] = [];
  const db = {
    query: {
      volumes: { findFirst: async () => (options.activeVolume ? { volumeKey: options.activeVolume } : undefined) },
      entities: { findMany: async () => [{ entityKey: 'kael', name: 'Kael', type: 'character', status: null, motivation: null, notes: null, body: null }] },
    },
  };
  const proposals = { get: async () => ({ id: 3n, changeSet: [kael, { op: 'action.audit_bible' }, rule, secret] }) };
  const ledger = {
    listActive: async () => (options.active ? [options.active] : []),
    append: async (_projectId: bigint, entries: NewLedgerEntry[]) => {
      if (options.racedBy) {
        options.active = options.racedBy;
        throw new Error('duplicate key value violates unique constraint');
      }
      return appendRows(entries);
    },
    supersede: async (_projectId: bigint, entryId: bigint, next: SupersedingEntry) => (superseded.push({ entryId, next }), ledgerEntry({ id: 51n, supersedesId: entryId })),
  };
  function appendRows(entries: NewLedgerEntry[]) {
    return (appended.push(...entries), entries.map(entry => ledgerEntry({ id: 50n, ...entry, ideaId: entry.idea?.ideaId ?? null })));
  }
  const service = new IdeaRejectionService({ getPostgresClient: () => db } as never, proposals as never, ledger as never);
  return { service, appended, superseded };
}

describe('IdeaRejectionService.reject', () => {
  it('should record never with no anchor, under the idea topic and a label that names the record', async () => {
    const { service, appended } = fakeRejections();

    await service.reject(7n, 3n, 0, { scope: 'never', why: 'The keeper has no rival.' });

    const ideaId = ideaIdOf(kael);
    expect(appended).toEqual([
      {
        kind: 'rejected',
        decidedBy: 'author',
        topic: `idea.${ideaId}`,
        statement: 'Kael (character): He wants the lamp.',
        why: 'The keeper has no rival.',
        idea: { ideaId, scope: 'never', anchor: null },
      },
    ]);
  });

  it('should anchor not_now to the active volume and not_this_version to the record as it stands', async () => {
    const { service, appended } = fakeRejections({ activeVolume: 'volume_2' });

    await service.reject(7n, 3n, 0, { scope: 'not_now' });
    await service.reject(7n, 3n, 0, { scope: 'not_this_version' });

    expect(appended[0]?.idea?.anchor).toEqual({ volumeKey: 'volume_2' });
    expect(appended[1]?.idea?.anchor).toEqual({ states: { 'entity:kael': { exists: true, revision: null, contentHash: expect.any(String) } } });
  });

  it('should supersede the winner when a concurrent first rejection of the same idea is refused by the unique index', async () => {
    const { service, appended, superseded } = fakeRejections({ racedBy: ledgerEntry({ id: 12n, kind: 'rejected' }) });

    await service.reject(7n, 3n, 0, { scope: 'not_now' });

    expect(appended).toEqual([]);
    expect(superseded.map(({ entryId, next }) => [entryId, next.idea?.scope])).toEqual([[12n, 'not_now']]);
  });

  it('should replace an earlier scope for the same idea rather than stack a second entry', async () => {
    const { service, appended, superseded } = fakeRejections({ active: ledgerEntry({ id: 9n, kind: 'rejected' }) });

    await service.reject(7n, 3n, 0, { scope: 'never' });

    expect(appended).toEqual([]);
    expect(superseded.map(({ entryId, next }) => [entryId, next.idea?.scope])).toEqual([[9n, 'never']]);
  });

  it('should keep a secret out of the label', async () => {
    const { service, appended } = fakeRejections();

    await service.reject(7n, 3n, 3, { scope: 'never' });

    expect(appended[0]?.statement).toBe('Secret kael_betrayal');
  });

  it('should refuse a missing op, an action, and a version scope for a change that touches no record', async () => {
    const { service, appended } = fakeRejections();

    await expect(service.reject(7n, 3n, 9, { scope: 'never' })).rejects.toMatchObject({ code: 'LDG_006' });
    await expect(service.reject(7n, 3n, 1, { scope: 'never' })).rejects.toMatchObject({ code: 'LDG_007' });
    await expect(service.reject(7n, 3n, 2, { scope: 'not_this_version' })).rejects.toMatchObject({ code: 'LDG_008' });
    expect(appended).toEqual([]);
  });
});
