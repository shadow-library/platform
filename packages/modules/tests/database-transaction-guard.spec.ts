import { describe, expect, it } from 'bun:test';

import { closeSettledTransactions } from '../src/database/database.utils';

interface FakeSql {
  (...args: unknown[]): string;
  unsafe: (query: string) => string;
  savepoint: (callback: (sql: FakeSql) => unknown) => Promise<unknown>;
}

function fakeSql(ran: string[]): FakeSql {
  const sql = ((query: string) => (ran.push(query), query)) as FakeSql;
  sql.unsafe = query => (ran.push(query), query);
  sql.savepoint = async callback => callback(fakeSql(ran));
  return sql;
}

function fakeClient() {
  const ran: string[] = [];
  const client = { begin: async (...args: unknown[]) => (args.at(-1) as (sql: FakeSql) => unknown)(fakeSql(ran)) };
  closeSettledTransactions(client);
  return { client, ran };
}

describe('closeSettledTransactions', () => {
  it('should run every query while the transaction is open', async () => {
    const { client, ran } = fakeClient();

    await client.begin('read write', async (sql: FakeSql) => {
      sql.unsafe('select 1');
      sql('select 2');
      await sql.savepoint(async savepoint => savepoint.unsafe('select 3'));
    });

    expect(ran).toEqual(['select 1', 'select 2', 'select 3']);
  });

  it('should refuse a query on a transaction handle used after its transaction ended, rather than run it on a pooled connection', async () => {
    const { client, ran } = fakeClient();
    let stale: FakeSql | undefined;

    await client.begin(async (sql: FakeSql) => void (stale = sql));

    expect(() => stale?.unsafe('select 1')).toThrow('used after its transaction ended');
    expect(() => stale?.('select 2')).toThrow('used after its transaction ended');
    expect(() => stale?.savepoint(async () => undefined)).toThrow('used after its transaction ended');
    expect(ran).toEqual([]);
  });

  it('should refuse a savepoint handle once its savepoint settled, while the transaction keeps running', async () => {
    const { client, ran } = fakeClient();

    await client.begin(async (sql: FakeSql) => {
      let stale: FakeSql | undefined;
      await sql.savepoint(async savepoint => void (stale = savepoint));
      expect(() => stale?.unsafe('select 1')).toThrow('used after its transaction ended');
      sql.unsafe('select 2');
    });

    expect(ran).toEqual(['select 2']);
  });

  it('should close the handle when the transaction callback throws too', async () => {
    const { client } = fakeClient();
    let stale: FakeSql | undefined;

    await expect(
      client.begin(async (sql: FakeSql) => {
        stale = sql;
        throw new Error('rolled back');
      }),
    ).rejects.toThrow('rolled back');

    expect(() => stale?.unsafe('select 1')).toThrow('used after its transaction ended');
  });
});
