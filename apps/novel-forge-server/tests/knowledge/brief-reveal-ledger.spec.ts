import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { ledgerBriefReveals, revokeProvisionalReveals } from '@server/common';

interface Brief {
  chapter: number;
  knowledgeContract: unknown;
}

interface Claimant {
  chapter: number;
  revision: number;
  status: 'draft' | 'final';
}

interface LedgerFixture {
  briefs?: Brief[];
  claimants?: Claimant[];
  deleted?: { factId: bigint; entityId: bigint }[];
}

interface Upsert {
  values: Record<string, unknown>[];
  set: Record<string, SQL>;
  setWhere: SQL;
}

const dialect = new PgDialect();
const statement = (query: SQL | undefined): { sql: string; params: unknown[] } => {
  const { sql, params } = dialect.sqlToQuery(query as SQL);
  return { sql, params };
};

const FACTS = [
  { id: 31n, factKey: 'hidden_tide' },
  { id: 32n, factKey: 'sunken_bell' },
];
const ENTITIES = [{ id: 41n, entityKey: 'keeper' }];

const learns = (...factKeys: string[]) => ({ pov: ['keeper'], learns: factKeys.map(factKey => ({ entityKey: 'keeper', factKey })) });

function fakeLedger(fixture: LedgerFixture) {
  const upserts: Upsert[] = [];
  const deletes: SQL[] = [];
  const claimantQueries: SQL[] = [];
  const db = {
    query: {
      briefs: {
        findFirst: async () => fixture.briefs?.[0],
        findMany: async () => fixture.briefs ?? [],
      },
      canonFacts: { findMany: async () => FACTS },
      entities: { findMany: async () => ENTITIES },
      drafts: {
        findMany: async (config: { where: SQL }) => {
          claimantQueries.push(config.where);
          return fixture.claimants ?? [];
        },
      },
    },
    delete: () => ({
      where: (where: SQL) => {
        deletes.push(where);
        return { returning: async () => fixture.deleted ?? [] };
      },
    }),
    insert: () => ({
      values: (values: Record<string, unknown>[]) => ({
        onConflictDoUpdate: async (config: { set: Record<string, SQL>; setWhere: SQL }) => void upserts.push({ values, set: config.set, setWhere: config.setWhere }),
      }),
    }),
  };
  return { db: db as never, upserts, deletes, claimantQueries };
}

describe('ledgerBriefReveals', () => {
  it('should replace the chapter’s rows with provisional ones bound to the approved revision, keeping the earliest claim and any manual row', async () => {
    const ledger = fakeLedger({ briefs: [{ chapter: 3, knowledgeContract: learns('hidden_tide', 'hidden_tide') }] });

    await ledgerBriefReveals(ledger.db, 1n, 3, 4);

    expect(statement(ledger.deletes[0]).params).toEqual([1n, 'brief', 3]);
    const [upsert] = ledger.upserts;
    expect(upsert?.values).toEqual([{ projectId: 1n, factId: 31n, entityId: 41n, learnedInChapter: 3, source: 'brief', status: 'provisional', draftRevision: 4 }]);
    expect(Object.fromEntries(Object.entries(upsert?.set ?? {}).map(([field, value]) => [field, statement(value).sql]))).toEqual({
      learnedInChapter: 'excluded.learned_in_chapter',
      status: 'excluded.status',
      draftRevision: 'excluded.draft_revision',
    });
    expect(statement(upsert?.setWhere)).toEqual({
      sql: '("character_knowledge"."source" = $1 and excluded.learned_in_chapter < "character_knowledge"."learned_in_chapter")',
      params: ['brief'],
    });
  });
});

describe('revokeProvisionalReveals', () => {
  it("should delete only the revoked chapter's brief-sourced rows", async () => {
    const ledger = fakeLedger({});

    await revokeProvisionalReveals(ledger.db, 1n, 5);

    expect(statement(ledger.deletes[0])).toEqual({
      sql: '("character_knowledge"."project_id" = $1 and "character_knowledge"."source" = $2 and "character_knowledge"."learned_in_chapter" = $3)',
      params: [1n, 'brief', 5],
    });
    expect(ledger.claimantQueries).toEqual([]);
    expect(ledger.upserts).toEqual([]);
  });

  it('should re-ledger a revoked reveal at the earliest chapter that still claims it, committed when that chapter is final', async () => {
    const ledger = fakeLedger({
      deleted: [{ factId: 31n, entityId: 41n }],
      claimants: [
        { chapter: 3, revision: 2, status: 'final' },
        { chapter: 7, revision: 5, status: 'draft' },
      ],
      briefs: [
        { chapter: 3, knowledgeContract: learns('hidden_tide') },
        { chapter: 7, knowledgeContract: learns('hidden_tide') },
      ],
    });

    await revokeProvisionalReveals(ledger.db, 1n, 5);

    expect(statement(ledger.claimantQueries[0])).toEqual({
      sql: '("drafts"."project_id" = $1 and ("drafts"."review_status" = $2 or "drafts"."status" = $3) and "drafts"."chapter" not in ($4))',
      params: [1n, 'approved', 'final', 5],
    });
    expect(ledger.upserts.map(upsert => upsert.values)).toEqual([
      [{ projectId: 1n, factId: 31n, entityId: 41n, learnedInChapter: 3, source: 'brief', status: 'committed', draftRevision: 2 }],
    ]);
  });

  it('should restore only the pairs it revoked, provisional and bound to the claiming approval', async () => {
    const ledger = fakeLedger({
      deleted: [{ factId: 32n, entityId: 41n }],
      claimants: [{ chapter: 7, revision: 5, status: 'draft' }],
      briefs: [{ chapter: 7, knowledgeContract: learns('hidden_tide', 'sunken_bell') }],
    });

    await revokeProvisionalReveals(ledger.db, 1n, 5);

    expect(ledger.upserts.map(upsert => upsert.values)).toEqual([
      [{ projectId: 1n, factId: 32n, entityId: 41n, learnedInChapter: 7, source: 'brief', status: 'provisional', draftRevision: 5 }],
    ]);
  });

  it('should leave a revoked reveal gone when no other approved or final chapter claims it', async () => {
    const ledger = fakeLedger({ deleted: [{ factId: 31n, entityId: 41n }], claimants: [] });

    await revokeProvisionalReveals(ledger.db, 1n, 5);

    expect(ledger.upserts).toEqual([]);
  });

  it('should do nothing for an empty set of chapters', async () => {
    const ledger = fakeLedger({});

    await revokeProvisionalReveals(ledger.db, 1n, []);

    expect(ledger.deletes).toEqual([]);
  });
});
