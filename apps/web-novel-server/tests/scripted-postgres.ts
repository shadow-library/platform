export interface ChainStep {
  method: string;
  args: unknown[];
}

export interface ChainCall {
  root: string;
  args: unknown[];
  steps: ChainStep[];
  /** The sequential round trip this query was sent in: queries awaited together share one, a query that waited on an answer lands in a later one. */
  round?: number;
}

export interface ScriptedPostgres {
  client: object;
  calls: ChainCall[];
}

export type Responder = (call: ChainCall) => unknown[];

/**
 * A Drizzle stand-in that records every query chain and answers each awaited one, in order, with the next scripted result set — or, given a
 * responder, with whatever it returns or throws for that chain. It runs no SQL, so a test reading its rows exercises the service's own
 * logic; a test asserting the SQL itself reads it from the recorded calls.
 */
export function scriptedPostgres(results: unknown[][] | Responder): ScriptedPostgres {
  const queue = Array.isArray(results) ? [...results] : [];
  const answer = (call: ChainCall): unknown[] => (Array.isArray(results) ? (queue.shift() ?? []) : results(call));
  const calls: ChainCall[] = [];
  let lastAnsweredRound = -1;
  const answerInRound = (call: ChainCall): unknown[] => {
    lastAnsweredRound = Math.max(lastAnsweredRound, call.round ?? 0);
    return answer(call);
  };
  const chain = (call: ChainCall): object => {
    const proxy: object = new Proxy(() => undefined, {
      get: (_target, property) => {
        if (property === 'then') {
          return (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
            call.round ??= lastAnsweredRound + 1;
            return Promise.resolve(call).then(answerInRound).then(resolve, reject);
          };
        }
        return (...args: unknown[]) => {
          call.steps.push({ method: String(property), args });
          return proxy;
        };
      },
    });
    return proxy;
  };
  const root =
    (name: string) =>
    (...args: unknown[]): object => {
      const call: ChainCall = { root: name, args, steps: [] };
      calls.push(call);
      return chain(call);
    };
  const client = {
    select: root('select'),
    insert: root('insert'),
    update: root('update'),
    delete: root('delete'),
    transaction: (work: (tx: object) => Promise<unknown>) => work(client),
  };
  return { client, calls };
}

export function stepArgs(call: ChainCall | undefined, method: string): unknown {
  return call?.steps.find(step => step.method === method)?.args[0];
}

/** How many sequential database round trips the recorded queries took. */
export function roundTrips(postgres: ScriptedPostgres): number {
  return Math.max(-1, ...postgres.calls.map(call => call.round ?? -1)) + 1;
}
