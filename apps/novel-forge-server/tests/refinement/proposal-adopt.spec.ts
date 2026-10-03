import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { type ChangeOp, ProposalService } from '@modules/refinement';
import { AppErrorCode } from '@server/classes';

const SESSION = '0f8fad5b-d9cb-469f-a165-70867728950e';
const OTHER_SESSION = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const dialect = new PgDialect();
const KINDS = ['chat', 'hub', 'premise_enhance', 'bible_audit', 'chapter_extract', 'plugin', 'chapter_plan', 'organise'];

interface FakeOptions {
  session?: { status: 'active' | 'archived' } | null;
  /** The card as each read finds it, in order; the last one repeats. */
  reads?: (Record<string, unknown> | null)[];
  /** What the guarded update returns; empty when the card was settled or moved between the read and the write. */
  updated?: Record<string, unknown>[];
}

function makeService({ session = { status: 'active' }, reads = [pendingProposal()], updated }: FakeOptions = {}) {
  const sessionReads: SQL[] = [];
  const writes: { values: Record<string, unknown>; where: SQL }[] = [];
  let read = 0;
  const db = {
    query: {
      chatSessions: {
        findFirst: async (query: { where: SQL }) => {
          sessionReads.push(query.where);
          return session ?? undefined;
        },
      },
      refinementProposals: { findFirst: async () => reads[Math.min(read++, reads.length - 1)] ?? undefined },
    },
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (where: SQL) => ({
          returning: async () => {
            writes.push({ values, where });
            return updated ?? [{ ...reads[0], ...values }];
          },
        }),
      }),
    }),
  };
  return { service: new ProposalService(new FakeDatabaseService({ postgres: db as never })), sessionReads, writes };
}

function pendingProposal(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 42n, projectId: 7n, sessionId: null, messageId: null, kind: 'bible_audit', status: 'pending', ...overrides };
}

describe('ProposalService.adopt', () => {
  it('should move a session-less pending card into the chat', async () => {
    const { service, writes } = makeService();

    const adopted = await service.adopt(7n, 42n, SESSION);

    expect(adopted.sessionId).toBe(SESSION);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.values).toMatchObject({ sessionId: SESSION });
  });

  it('should keep the message another chat’s card answered, so a plan it starts still reads the author’s words', async () => {
    const { service, writes } = makeService({ reads: [pendingProposal({ kind: 'chat', sessionId: OTHER_SESSION, messageId: 9n })] });

    const adopted = await service.adopt(7n, 42n, SESSION);

    expect(adopted).toMatchObject({ sessionId: SESSION, messageId: 9n });
    expect(writes[0]?.values).not.toHaveProperty('messageId');
  });

  it('should write only while the card is still pending and still where it was read', async () => {
    const { service, writes } = makeService();

    await service.adopt(7n, 42n, SESSION);

    const { sql, params } = dialect.sqlToQuery(writes[0]?.where as SQL);
    expect(sql).toContain('"status" = $2');
    expect(sql).toContain('"session_id" is null');
    expect(params).toEqual([42n, 'pending']);
  });

  it('should compare the chat it read when the card came from another chat', async () => {
    const { service, writes } = makeService({ reads: [pendingProposal({ kind: 'chat', sessionId: OTHER_SESSION })] });

    await service.adopt(7n, 42n, SESSION);

    const { sql, params } = dialect.sqlToQuery(writes[0]?.where as SQL);
    expect(sql).toContain('"session_id" = $3');
    expect(params).toEqual([42n, 'pending', OTHER_SESSION]);
  });

  it('should hand back a card the chat already holds without writing', async () => {
    const { service, writes } = makeService({ reads: [pendingProposal({ sessionId: SESSION })] });

    const adopted = await service.adopt(7n, 42n, SESSION);

    expect(adopted.sessionId).toBe(SESSION);
    expect(writes).toEqual([]);
  });

  it('should refuse a card that is no longer pending with a conflict', async () => {
    const { service, writes } = makeService({ reads: [pendingProposal({ status: 'applied' })] });

    await expect(service.adopt(7n, 42n, SESSION)).rejects.toMatchObject({ code: 'RFN_019' });
    expect(AppErrorCode.RFN_019.status).toBe(409);
    expect(writes).toEqual([]);
  });

  it('should refuse when the card was settled between the read and the write', async () => {
    const { service } = makeService({ reads: [pendingProposal(), pendingProposal({ status: 'discarded' })], updated: [] });

    await expect(service.adopt(7n, 42n, SESSION)).rejects.toMatchObject({ code: 'RFN_019' });
  });

  it('should refuse when another chat took the card between the read and the write', async () => {
    const { service } = makeService({ reads: [pendingProposal(), pendingProposal({ sessionId: OTHER_SESSION })], updated: [] });

    await expect(service.adopt(7n, 42n, SESSION)).rejects.toMatchObject({ code: 'RFN_019' });
  });

  it('should answer a second tab bringing the card into the same chat with the card', async () => {
    const { service } = makeService({ reads: [pendingProposal(), pendingProposal({ sessionId: SESSION })], updated: [] });

    expect((await service.adopt(7n, 42n, SESSION)).sessionId).toBe(SESSION);
  });

  it('should refuse a chat of another project as not found, reading the session within the project', async () => {
    const { service, sessionReads, writes } = makeService({ session: null });

    await expect(service.adopt(7n, 42n, SESSION)).rejects.toMatchObject({ code: 'CHT_001' });
    const { sql, params } = dialect.sqlToQuery(sessionReads[0] as SQL);
    expect(sql).toContain('"project_id" = $2');
    expect(params).toEqual([SESSION, 7n]);
    expect(writes).toEqual([]);
  });

  it('should refuse an archived chat', async () => {
    const { service, writes } = makeService({ session: { status: 'archived' } });

    await expect(service.adopt(7n, 42n, SESSION)).rejects.toMatchObject({ code: 'CHT_002' });
    expect(writes).toEqual([]);
  });

  it('should refuse a card of another project as not found', async () => {
    const { service } = makeService({ reads: [null] });

    await expect(service.adopt(7n, 42n, SESSION)).rejects.toMatchObject({ code: 'RFN_001' });
  });
});

describe('ProposalService.create — a card brought into a chat', () => {
  const factOp: ChangeOp[] = [{ op: 'fact.upsert', factKey: 'f1', revealChapter: null }];

  /** Pending cards of the chat, as a query that honours the kinds it asks for would find them. */
  function stagingExecutor(pending: Record<string, unknown>[]) {
    const superseded: unknown[] = [];
    const executor = {
      query: {
        canonFacts: { findMany: async () => [] },
        refinementProposals: {
          findMany: async (query: { where: SQL }) => {
            const { params } = dialect.sqlToQuery(query.where);
            const kinds = params.filter(param => KINDS.includes(param as string));
            return kinds.length === 0 ? pending : pending.filter(row => kinds.includes(row.kind));
          },
        },
      },
      insert: () => ({ values: (values: Record<string, unknown>) => ({ returning: async () => [{ id: 300n, ...values }] }) }),
      update: () => ({ set: () => ({ where: async (where: SQL) => superseded.push(dialect.sqlToQuery(where).params[0]) }) }),
    };
    return { executor: executor as never, superseded };
  }

  it('should leave an adopted audit card standing when the chat stages a later card on the same record', async () => {
    const service = new ProposalService(new FakeDatabaseService());
    const audit = { id: 41n, kind: 'bible_audit', sessionId: SESSION, status: 'pending', changeSet: factOp };
    const ownCard = { id: 40n, kind: 'chat', sessionId: SESSION, status: 'pending', changeSet: factOp };
    const { executor, superseded } = stagingExecutor([audit, ownCard]);

    await service.create(7n, { sessionId: SESSION, scopeType: 'project', kind: 'hub', changeSet: factOp, warnings: [], baseline: {} }, executor);

    expect(superseded).toEqual([40n]);
  });
});
