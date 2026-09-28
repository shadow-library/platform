import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';

import { type SQL, sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { AuditService } from '@server/modules/infrastructure/audit/audit.service';
import { type AuditEvent } from '@server/modules/infrastructure/datastore';

type Row = AuditEvent & { chainPosition: bigint | null };

interface OrderTerm {
  column: 'id' | 'chain_position';
  descending: boolean;
  nullsFirst: boolean;
}

const dialect = new PgDialect();

const render = (fragments: unknown[]): string => dialect.sqlToQuery(sql.join(fragments as SQL[], sql`, `)).sql;

function parseOrder(orderBy: string): OrderTerm[] {
  return orderBy.split(', ').map(term => {
    const column = term.includes('"chain_position"') ? 'chain_position' : 'id';
    const descending = /\bdesc\b/i.test(term);
    const nullsFirst = /nulls first/i.test(term) || (descending && !/nulls last/i.test(term));
    return { column, descending, nullsFirst };
  });
}

function compare(left: Row, right: Row, terms: OrderTerm[]): number {
  for (const term of terms) {
    const a = term.column === 'id' ? left.id : left.chainPosition;
    const b = term.column === 'id' ? right.id : right.chainPosition;
    if (a === b) continue;
    if (a === null || a === undefined) return term.nullsFirst ? -1 : 1;
    if (b === null || b === undefined) return term.nullsFirst ? 1 : -1;
    const order = a < b ? -1 : 1;
    return term.descending ? -order : order;
  }
  return 0;
}

/** Holds one chain's rows and answers the select shapes AuditService issues as Postgres would, ordering by whatever ORDER BY it is given. */
class AuditTable {
  readonly rows: Row[] = [];

  private select() {
    let where = '';
    let terms: OrderTerm[] = [];
    const resolve = (limit?: number): Row[] => {
      const visible = this.rows.filter(row => !where.includes('"chain_position" is not null') || row.chainPosition !== null);
      const sorted = [...visible].sort((left, right) => compare(left, right, terms));
      return limit === undefined ? sorted : sorted.slice(0, limit);
    };
    const builder = {
      from: () => builder,
      where: (condition: SQL) => {
        where = dialect.sqlToQuery(condition).sql;
        return builder;
      },
      orderBy: (...columns: unknown[]) => {
        terms = parseOrder(render(columns));
        return { limit: (count: number) => Promise.resolve(resolve(count)), then: (onFulfilled: (rows: Row[]) => unknown) => Promise.resolve(resolve()).then(onFulfilled) };
      },
    };
    return builder;
  }

  readonly tx = {
    execute: () => Promise.resolve(),
    select: () => this.select(),
    insert: () => ({
      values: (row: Row) => ({
        returning: () => {
          const stored = { ...row, chainPosition: row.chainPosition ?? null };
          this.rows.push(stored);
          return Promise.resolve([stored]);
        },
      }),
    }),
  };

  readonly db = { transaction: <T>(work: (tx: AuditTable['tx']) => Promise<T>) => work(this.tx), select: () => this.select() };
}

function auditServiceOver(table: AuditTable): AuditService {
  return new AuditService(new FakeDatabaseService({ postgres: table.db }), { fanOut: () => Promise.resolve() } as never);
}

const EVENT = { action: 'org.domain_registered', outcome: 'SUCCESS', actorType: 'USER', actorId: '11', organisationId: '42' } as const;

/** A row as the pre-fix writer left it: no chain position, linked to whichever predecessor held the largest id. */
function legacyRow(service: AuditService, id: string, prevHash: string | null, detail: Record<string, unknown> = {}): Row {
  const record = {
    id,
    occurredAt: new Date('2026-09-01T00:00:00.000Z'),
    organisationId: '42',
    actorType: 'USER' as const,
    actorId: '11',
    action: 'org.domain_registered',
    targetType: null,
    targetId: null,
    outcome: 'SUCCESS' as const,
    ipAddress: null,
    correlationId: null,
    detail,
  };
  const hash = (service as unknown as { computeHash(prev: string | null, row: object): string }).computeHash(prevHash, record);
  return { ...record, prevHash, hash, chainPosition: null };
}

/** Mints ids that sort in the reverse of write order, as UUIDv7 ids minted within one millisecond or on skewed replicas can. */
function mintDescendingIds() {
  let next = 9;
  return spyOn(Bun, 'randomUUIDv7').mockImplementation((() => `00000000-0000-7000-8000-00000000000${next--}`) as typeof Bun.randomUUIDv7);
}

describe('AuditService', () => {
  afterEach(() => mock.restore());

  describe('record', () => {
    it('should chain onto the most recently inserted event even when an earlier one holds a larger id', async () => {
      const table = new AuditTable();
      const service = auditServiceOver(table);
      mintDescendingIds();
      const first = await service.record(EVENT);
      const second = await service.record(EVENT);

      const third = await service.record(EVENT);

      expect(second.prevHash).toBe(first.hash);
      expect(third.prevHash).toBe(second.hash);
      expect(table.rows.map(row => row.chainPosition)).toEqual([1n, 2n, 3n]);
    });

    it('should continue a legacy chain from the event the old writer would have chosen, at position one', async () => {
      const table = new AuditTable();
      const service = auditServiceOver(table);
      const root = legacyRow(service, '00000000-0000-7000-8000-000000000001', null);
      const tip = legacyRow(service, '00000000-0000-7000-8000-000000000002', root.hash);
      table.rows.push(root, tip);

      const next = await service.record(EVENT);

      expect(next.prevHash).toBe(tip.hash);
      expect(table.rows.at(-1)?.chainPosition).toBe(1n);
    });
  });

  describe('verifyChain', () => {
    it('should accept a chain written by concurrent writers whatever order their ids sort in', async () => {
      const table = new AuditTable();
      const service = auditServiceOver(table);
      mintDescendingIds();
      for (let index = 0; index < 4; index++) await service.record(EVENT);

      expect(await service.verifyChain('42')).toEqual({ valid: true });
    });

    it('should accept legacy links forked by the old id-ordered writer and the ordered chain anchored after them', async () => {
      const table = new AuditTable();
      const service = auditServiceOver(table);
      const root = legacyRow(service, '00000000-0000-7000-8000-000000000001', null);
      const left = legacyRow(service, '00000000-0000-7000-8000-000000000003', root.hash);
      const right = legacyRow(service, '00000000-0000-7000-8000-000000000002', root.hash, { fork: true });
      table.rows.push(root, left, right);
      await service.record(EVENT);
      await service.record(EVENT);

      expect(await service.verifyChain('42')).toEqual({ valid: true });
    });

    it('should reject a legacy event whose content no longer matches its hash', async () => {
      const table = new AuditTable();
      const service = auditServiceOver(table);
      const root = legacyRow(service, '00000000-0000-7000-8000-000000000001', null);
      const tampered = { ...legacyRow(service, '00000000-0000-7000-8000-000000000002', root.hash), action: 'org.deleted' };
      table.rows.push(root, tampered);

      expect(await service.verifyChain('42')).toEqual({ valid: false, brokenAt: tampered.id });
    });

    it('should reject a legacy event linked to a predecessor that is not in the chain', async () => {
      const table = new AuditTable();
      const service = auditServiceOver(table);
      const root = legacyRow(service, '00000000-0000-7000-8000-000000000001', null);
      const orphan = legacyRow(service, '00000000-0000-7000-8000-000000000002', 'f'.repeat(64));
      table.rows.push(root, orphan);

      expect(await service.verifyChain('42')).toEqual({ valid: false, brokenAt: orphan.id });
    });

    it('should reject an ordered event that does not link to the event before it', async () => {
      const table = new AuditTable();
      const service = auditServiceOver(table);
      for (let index = 0; index < 3; index++) await service.record(EVENT);
      const forked = table.rows[2] as Row;
      table.rows[2] = { ...legacyRow(service, forked.id, (table.rows[0] as Row).hash), chainPosition: 3n };

      expect(await service.verifyChain('42')).toEqual({ valid: false, brokenAt: forked.id });
    });

    it('should reject an ordered chain with a missing position', async () => {
      const table = new AuditTable();
      const service = auditServiceOver(table);
      for (let index = 0; index < 3; index++) await service.record(EVENT);
      const removed = table.rows.splice(1, 1)[0] as Row;
      const next = table.rows[1] as Row;

      expect(removed.chainPosition).toBe(2n);
      expect(await service.verifyChain('42')).toEqual({ valid: false, brokenAt: next.id });
    });
  });
});
