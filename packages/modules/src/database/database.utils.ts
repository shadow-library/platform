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
