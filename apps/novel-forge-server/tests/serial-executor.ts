type Chain = ((...args: unknown[]) => Chain) & PromiseLike<unknown>;

export interface SerialProbe {
  /** A query handle standing in for one transaction: every relational read resolves empty on a later macrotask. */
  db: unknown;
  /** The most queries that were in flight on the handle at once. */
  peak(): number;
}

/** Counts how many queries overlap on one handle, which a transaction's single connection cannot serve. */
export function serialProbe(): SerialProbe {
  let inFlight = 0;
  let peak = 0;

  const settle = <T>(value: T): Promise<T> => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    return new Promise(resolve =>
      setTimeout(() => {
        inFlight -= 1;
        resolve(value);
      }, 0),
    );
  };

  const chain = (value: unknown): Chain =>
    new Proxy(() => undefined, {
      get: (_target, property) => (property === 'then' ? (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => settle(value).then(resolve, reject) : chain(value)),
      apply: () => chain(value),
    }) as unknown as Chain;

  const table = { findMany: () => chain([]), findFirst: () => chain(undefined) };
  const db = {
    query: new Proxy({}, { get: () => table }),
    select: () => chain([]),
    selectDistinct: () => chain([]),
  };
  return { db, peak: () => peak };
}
