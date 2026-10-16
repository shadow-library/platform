import { TransactionRollbackError } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pg-proxy';

import { type PrimaryDatabase, schema } from '@server/database';

export interface ExecutedQuery {
  sql: string;
  params: unknown[];
  /** `execute` for raw SQL, answered with row objects as Bun SQL returns them; `all` for a builder, answered with rows in array mode */
  method: string;
}

export type QueryAnswer = (query: ExecutedQuery) => unknown[] | Error;

export interface FakePostgres {
  db: PrimaryDatabase;
  queries: ExecutedQuery[];
  /** `begin`, `commit` and `rollback` around the statements each transaction ran */
  log: string[];
}

/**
 * A real Drizzle query builder whose statements never leave the process: pg-proxy hands each one to `answer`, and transactions run on the same
 * handle, recorded in `log`. pg-proxy has no transactions of its own, so `transaction` is layered on.
 */
export function fakePostgres(answer: QueryAnswer = () => []): FakePostgres {
  const queries: ExecutedQuery[] = [];
  const log: string[] = [];
  const proxy = drizzle(
    async (sql, params, method) => {
      const query = { sql, params, method };
      queries.push(query);
      log.push(sql);
      const rows = answer(query);
      if (rows instanceof Error) throw rows;
      return { rows };
    },
    { schema },
  );
  const tx = Object.assign(Object.create(proxy) as object, {
    rollback: (): never => {
      throw new TransactionRollbackError();
    },
  });
  const transaction = async (work: (handle: unknown) => Promise<unknown>): Promise<unknown> => {
    log.push('begin');
    try {
      const result = await work(tx);
      log.push('commit');
      return result;
    } catch (error) {
      log.push('rollback');
      throw error;
    }
  };
  const db = Object.assign(Object.create(proxy) as object, { transaction }) as PrimaryDatabase;
  return { db, queries, log };
}
