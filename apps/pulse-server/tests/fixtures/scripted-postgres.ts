import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { type PrimaryDatabase } from '@server/database';

export interface RecordedCall {
  root: string;
  inTransaction: boolean;
  steps: { method: string; args: unknown[] }[];
}

export interface ScriptedPostgres {
  db: PrimaryDatabase;
  calls: RecordedCall[];
}

export function postgresError(constraint: string): Error {
  return Object.assign(new Error(`duplicate key value violates unique constraint "${constraint}"`), { code: 'ERR_POSTGRES_SERVER_ERROR', constraint });
}

/** Answers each awaited query, in order, with the next scripted result (an Error rejects); every chain is recorded with whether it ran inside `transaction`. It runs no SQL. */
export function scriptedPostgres(results: unknown[]): ScriptedPostgres {
  const queue = [...results];
  const calls: RecordedCall[] = [];
  let inTransaction = false;

  const settle = (call: RecordedCall): Promise<unknown> => {
    if (queue.length === 0) return Promise.reject(new Error(`unscripted query: ${call.root}`));
    const next = queue.shift();
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  };
  const chain = (call: RecordedCall): object => {
    const proxy: object = new Proxy(() => undefined, {
      get: (_target, property) => {
        if (property === 'then') return (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => settle(call).then(resolve, reject);
        return (...args: unknown[]) => {
          call.steps.push({ method: String(property), args });
          return proxy;
        };
      },
    });
    return proxy;
  };
  const start = (root: string, args: unknown[]): object => {
    const call: RecordedCall = { root, inTransaction, steps: [{ method: root, args }] };
    calls.push(call);
    return chain(call);
  };
  const query = new Proxy(
    {},
    {
      get: (_target, table) => ({
        findFirst: (...args: unknown[]) => start(`query.${String(table)}.findFirst`, args),
        findMany: (...args: unknown[]) => start(`query.${String(table)}.findMany`, args),
      }),
    },
  );
  const db = {
    select: (...args: unknown[]) => start('select', args),
    insert: (...args: unknown[]) => start('insert', args),
    update: (...args: unknown[]) => start('update', args),
    delete: (...args: unknown[]) => start('delete', args),
    query,
    transaction: async (work: (tx: object) => Promise<unknown>): Promise<unknown> => {
      inTransaction = true;
      try {
        return await work(db);
      } finally {
        inTransaction = false;
      }
    },
  };
  return { db: db as unknown as PrimaryDatabase, calls };
}

export function rejectionCode(promise: Promise<unknown>): Promise<string | undefined> {
  return promise.then(
    () => undefined,
    (error: { code?: string }) => error.code,
  );
}

export function step(call: RecordedCall | undefined, method: string): unknown[] | undefined {
  return call?.steps.find(entry => entry.method === method)?.args;
}

export function renderSql(fragment: unknown): string {
  return new PgDialect().sqlToQuery(fragment as SQL).sql;
}
