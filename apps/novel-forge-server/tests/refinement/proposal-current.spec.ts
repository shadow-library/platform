import { describe, expect, it } from 'bun:test';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { AppErrorCode } from '@server/classes';
import { type ChangeOp, ProposalService } from '@modules/refinement';
import { currentRefs, proposalCurrent } from '@modules/refinement/proposal-current';

const NO_RECORDS = new Map<string, Record<string, unknown>>();

describe('proposalCurrent', () => {
  it('should return only the fields the premise op carries', () => {
    const records = new Map([['premise', { premise: 'old', brief: 'b', themes: ['x'], instructions: '', theme: null, ending: 'e' }]]);
    const changeSet: ChangeOp[] = [{ op: 'premise.update', premise: 'new', theme: 'loss', rationale: 'why' }];

    expect(proposalCurrent(changeSet, records)).toEqual([{ index: 0, exists: true, values: { premise: 'old', theme: null } }]);
  });

  it('should return frontmatter and body for a document whose slug contains a slash', () => {
    const records = new Map([['doc:world/places/city', { body: 'old body', frontmatter: { title: 'City' } }]]);
    const changeSet: ChangeOp[] = [{ op: 'bible_document.upsert', section: 'world' as never, slug: 'places/city', body: 'new body' }];

    expect(proposalCurrent(changeSet, records)).toEqual([{ index: 0, exists: true, values: { frontmatter: { title: 'City' }, body: 'old body' } }]);
  });

  it('should return a changed entity type, exclude identity keys and report a missing artifact as not existing', () => {
    const changeSet: ChangeOp[] = [
      { op: 'entity.upsert', entityKey: 'mara', type: 'character', name: 'Mara' },
      { op: 'fact.upsert', factKey: 'f1', body: 'text' },
    ];
    const records = new Map([['entity:mara', { type: 'faction', name: 'Old Mara', body: 'b' }]]);

    expect(proposalCurrent(changeSet, records)).toEqual([
      { index: 0, exists: true, values: { type: 'faction', name: 'Old Mara' } },
      { index: 1, exists: false, values: {} },
    ]);
  });

  it('should keep the op index of the change-set when other ops sit between', () => {
    const changeSet: ChangeOp[] = [{ op: 'action.audit_bible' }, { op: 'fact.remove', factKey: 'f0' }, { op: 'fact.upsert', factKey: 'f1', body: 'new', revealChapter: null }];
    const records = new Map([['fact:f1', { body: 'old', revealChapter: 4, terms: [] }]]);

    expect(proposalCurrent(changeSet, records)).toEqual([{ index: 2, exists: true, values: { body: 'old', revealChapter: 4 } }]);
  });

  it('should distinguish a thread from a mystery with the same key and skip fields the record does not hold', () => {
    const changeSet: ChangeOp[] = [
      { op: 'promise.create', kind: 'mystery', key: 'k', label: 'Who?', openedChapter: 2 },
      { op: 'promise.update', kind: 'thread', key: 'k', status: 'paid_off' },
    ];
    const records = new Map([['promise:thread:k', { label: 'Thread', status: 'open' }]]);

    expect(proposalCurrent(changeSet, records)).toEqual([
      { index: 0, exists: false, values: {} },
      { index: 1, exists: true, values: { status: 'open' } },
    ]);
  });

  it('should return nothing for a proposal of only action ops', () => {
    const changeSet: ChangeOp[] = [{ op: 'action.generate_chapter', chapter: 1 }, { op: 'action.audit_bible' }];

    expect(proposalCurrent(changeSet, NO_RECORDS)).toEqual([]);
    expect(currentRefs(changeSet)).toEqual([]);
  });
});

describe('ProposalService.currentValues', () => {
  function makeService(proposal: Record<string, unknown> | undefined, findMany: Record<string, unknown[]> = {}) {
    const queries: string[] = [];
    const table = (name: string) => ({
      findMany: async () => (queries.push(name), findMany[name] ?? []),
      findFirst: async () => (queries.push(name), findMany[name]?.[0]),
    });
    const db = {
      query: {
        refinementProposals: { findFirst: async () => proposal },
        projects: table('projects'),
        entities: table('entities'),
        canonFacts: table('canonFacts'),
        bibleDocuments: table('bibleDocuments'),
      },
    };
    return { service: new ProposalService(new FakeDatabaseService({ postgres: db as never })), queries };
  }

  it('should reject a proposal outside the project as not found', async () => {
    const { service } = makeService(undefined);

    await expect(service.currentValues(1n, 9n)).rejects.toMatchObject({ code: AppErrorCode.RFN_001.code });
  });

  it('should answer an action-only proposal without reading any artifact', async () => {
    const { service, queries } = makeService({ changeSet: [{ op: 'action.audit_bible' }] });

    expect(await service.currentValues(1n, 9n)).toEqual([]);
    expect(queries).toEqual([]);
  });

  it('should not read entities more than twice however many entity ops there are', async () => {
    const changeSet = [
      { op: 'entity.upsert', entityKey: 'a', type: 'character', name: 'A2' },
      { op: 'entity.upsert', entityKey: 'b', type: 'character', name: 'B2' },
      { op: 'entity.upsert', entityKey: 'c', type: 'character', name: 'C2' },
      { op: 'entity.upsert', entityKey: 'd', type: 'character', name: 'D2' },
      { op: 'fact.upsert', factKey: 'f', body: 'x' },
    ];
    const { service, queries } = makeService(
      { changeSet },
      { entities: [{ entityKey: 'a', type: 'character', name: 'A1', status: null, motivation: null, notes: null, body: '' }] },
    );

    const result = await service.currentValues(1n, 9n);

    expect(result).toEqual([
      { index: 0, exists: true, values: { type: 'character', name: 'A1' } },
      { index: 1, exists: false, values: {} },
      { index: 2, exists: false, values: {} },
      { index: 3, exists: false, values: {} },
      { index: 4, exists: false, values: {} },
    ]);
    expect(queries.filter(name => name === 'entities').length).toBeLessThanOrEqual(2);
  });
});
