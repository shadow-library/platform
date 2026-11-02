import { AppError } from '@shadow-library/common';

export function renderPostgresQuery(query: string, params: unknown[]): string {
  // Last to first, so $10 is not replaced as $1 followed by a literal 0. Log-readability only; not a safe SQL renderer.
  let formattedQuery = query;
  for (let index = params.length - 1; index >= 0; index--) {
    const param = params[index];
    const value = typeof param === 'string' ? `'${param}'` : String(param);
    formattedQuery = formattedQuery.replace(`$${index + 1}`, value);
  }
  return formattedQuery;
}

type ScopeCallback = (sql: object) => unknown;

export interface TransactionalClient {
  begin: (...args: unknown[]) => Promise<unknown>;
}

const SCOPED_METHODS = new Set<PropertyKey>(['unsafe', 'savepoint']);

function refuseSettled(): never {
  throw AppError.internal('A transaction handle was used after its transaction ended; its query would run on whichever pooled connection is free');
}

function scoped(args: unknown[], isParentOpen: () => boolean): unknown[] {
  const callback = args.at(-1) as ScopeCallback;
  const run = async (sql: object): Promise<unknown> => {
    let open = true;
    try {
      return await callback(guardScope(sql, () => open && isParentOpen()));
    } finally {
      open = false;
    }
  };
  return [...args.slice(0, -1), run];
}

function guardScope(sql: object, isOpen: () => boolean): object {
  return new Proxy(sql, {
    apply: (target, thisArg, args) => (isOpen() ? Reflect.apply(target as (...values: unknown[]) => unknown, thisArg, args) : refuseSettled()),
    get: (target, property) => {
      const value: unknown = Reflect.get(target, property);
      if (typeof value !== 'function' || !SCOPED_METHODS.has(property)) return value;
      const method = value as (...values: unknown[]) => unknown;
      if (property === 'unsafe') return (...args: unknown[]) => (isOpen() ? method.apply(target, args) : refuseSettled());
      return (...args: unknown[]) => (isOpen() ? method.apply(target, scoped(args, isOpen)) : refuseSettled());
    },
  });
}

/**
 * Bun SQL 1.3.14 keeps a transaction's or savepoint's handle working after it settles and runs its later queries on whichever pooled connection
 * is free — inside another request's open transaction, which then fails with 25001 or 25P02. Each handle refuses once its scope has settled.
 */
export function closeSettledTransactions(client: TransactionalClient): void {
  const begin = client.begin.bind(client);
  client.begin = (...args: unknown[]) => begin(...scoped(args, () => true));
}

export type QueryObserver = (query: string, durationMs: number) => void;

type Settle = (value: unknown) => unknown;

interface PendingQuery {
  then: (onFulfilled?: Settle | null, onRejected?: Settle | null) => unknown;
}

const isPendingQuery = (value: unknown): value is PendingQuery => typeof value === 'object' && value !== null && typeof (value as PendingQuery).then === 'function';

/** Bun SQL and postgres.js queries are lazy thenables that start on their first `then`, so the clock starts there and `.values()` set before it still applies. */
function timeQuery(pending: unknown, query: string, observer: QueryObserver): unknown {
  if (!isPendingQuery(pending)) return pending;
  const then = pending.then;
  let isTimed = false;
  pending.then = function (this: PendingQuery, onFulfilled, onRejected) {
    if (isTimed) return then.call(this, onFulfilled, onRejected);
    isTimed = true;
    const startedAt = performance.now();
    const fulfilled = (value: unknown): unknown => {
      observer(query, performance.now() - startedAt);
      return onFulfilled ? onFulfilled(value) : value;
    };
    const rejected = (error: unknown): unknown => {
      observer(query, performance.now() - startedAt);
      if (onRejected) return onRejected(error);
      throw error;
    };
    return then.call(this, fulfilled, rejected);
  };
  return pending;
}

const SCOPE_OPENERS = ['begin', 'savepoint'] as const;

/**
 * Times every query Drizzle runs through the driver's `unsafe`, on the client and on each transaction and savepoint handle it opens; Drizzle's own
 * logger fires before execution, so it cannot. The observer receives the parameterised SQL text only. Apply before `closeSettledTransactions`.
 */
export function observeQueries(sql: object, observer: QueryObserver, isEnabled: () => boolean): void {
  const target = sql as Record<string, unknown>;
  const unsafe = target.unsafe;
  if (typeof unsafe === 'function') {
    target.unsafe = (query: string, ...args: unknown[]) => {
      const pending: unknown = unsafe.call(sql, query, ...args);
      return isEnabled() ? timeQuery(pending, query, observer) : pending;
    };
  }

  for (const opener of SCOPE_OPENERS) {
    const open = target[opener];
    if (typeof open !== 'function') continue;
    target[opener] = (...args: unknown[]) => {
      const callback = args.at(-1);
      if (typeof callback !== 'function') return open.apply(sql, args);
      const observed = (scoped: object): unknown => {
        observeQueries(scoped, observer, isEnabled);
        return (callback as ScopeCallback)(scoped);
      };
      return open.apply(sql, [...args.slice(0, -1), observed]);
    };
  }
}
