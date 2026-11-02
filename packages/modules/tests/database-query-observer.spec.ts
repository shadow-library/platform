import { describe, expect, it } from 'bun:test';

import { closeSettledTransactions, observeQueries, type QueryObserver } from '../src/database/database.utils';

class FakeQuery extends Promise<unknown> {
  mode = 'objects';
  started = false;

  values(): this {
    this.mode = 'values';
    return this;
  }
}

interface FakeSql {
  (...args: unknown[]): unknown;
  unsafe: (query: string, params?: unknown[]) => FakeQuery;
  begin: (...args: unknown[]) => Promise<unknown>;
  savepoint: (callback: (sql: FakeSql) => unknown) => Promise<unknown>;
}

interface Run {
  query: string;
  mode: string;
}

function lazyQuery(query: string, ran: Run[], outcome: () => unknown): FakeQuery {
  let execute: (() => void) | undefined;
  const pending = new FakeQuery((resolve, reject) => {
    execute = () => {
      try {
        resolve(outcome());
      } catch (error) {
        reject(error);
      }
    };
  });
  const then = pending.then;
  pending.then = function (this: FakeQuery, onFulfilled, onRejected) {
    if (!this.started) {
      this.started = true;
      ran.push({ query, mode: this.mode });
      execute?.();
    }
    return then.call(this, onFulfilled, onRejected);
  } as FakeQuery['then'];
  return pending;
}

function fakeSql(ran: Run[], outcome: () => unknown = () => []): FakeSql {
  const sql = (() => undefined) as unknown as FakeSql;
  sql.unsafe = query => lazyQuery(query, ran, outcome);
  sql.begin = async (...args) => (args.at(-1) as (sql: FakeSql) => unknown)(fakeSql(ran, outcome));
  sql.savepoint = async callback => callback(fakeSql(ran, outcome));
  return sql;
}

function observe(sql: FakeSql, isEnabled = true): Parameters<QueryObserver>[] {
  const observed: Parameters<QueryObserver>[] = [];
  observeQueries(
    sql,
    (query, durationMs) => observed.push([query, durationMs]),
    () => isEnabled,
  );
  return observed;
}

describe('observeQueries', () => {
  it('should report the SQL text and a duration once a query settles', async () => {
    const ran: Run[] = [];
    const sql = fakeSql(ran);
    const observed = observe(sql);

    await sql.unsafe('select * from users where id = $1', ['user-1']);

    expect(observed).toHaveLength(1);
    expect(observed[0]?.[0]).toBe('select * from users where id = $1');
    expect(observed[0]?.[1]).toBeGreaterThanOrEqual(0);
  });

  it('should leave a lazy query unstarted until it is awaited, so a result mode chained before still applies', async () => {
    const ran: Run[] = [];
    const sql = fakeSql(ran);
    const observed = observe(sql);

    const pending = sql.unsafe('select 1').values();
    expect(ran).toEqual([]);
    await pending;

    expect(ran).toEqual([{ query: 'select 1', mode: 'values' }]);
    expect(observed).toHaveLength(1);
  });

  it('should report a failed query once and rethrow its error', async () => {
    const sql = fakeSql([], () => {
      throw new Error('relation does not exist');
    });
    const observed = observe(sql);

    await expect(sql.unsafe('select * from missing')).rejects.toThrow('relation does not exist');

    expect(observed.map(([query]) => query)).toEqual(['select * from missing']);
  });

  it('should report a query once however often it is awaited', async () => {
    const sql = fakeSql([]);
    const observed = observe(sql);

    const pending = sql.unsafe('select 1');
    await pending;
    await pending;

    expect(observed).toHaveLength(1);
  });

  it('should observe the queries of transaction and savepoint handles, also under the settled-transaction guard', async () => {
    const ran: Run[] = [];
    const sql = fakeSql(ran);
    const observed = observe(sql);
    closeSettledTransactions(sql);

    await sql.begin('read write', async (tx: FakeSql) => {
      await tx.unsafe('select 1');
      await tx.savepoint(async savepoint => savepoint.unsafe('select 2'));
    });

    expect(observed.map(([query]) => query)).toEqual(['select 1', 'select 2']);
  });

  it('should hand back the driver query untouched while disabled', async () => {
    const sql = fakeSql([]);
    const observed = observe(sql, false);

    await sql.unsafe('select 1');

    expect(observed).toEqual([]);
  });
});
