export interface ChainStep {
  method: string;
  args: unknown[];
}

export interface ChainCall {
  root: string;
  args: unknown[];
  steps: ChainStep[];
}

export interface ScriptedPostgres {
  client: object;
  calls: ChainCall[];
}

/**
 * A Drizzle stand-in that records every query chain and answers each awaited one, in order, with the next scripted result set. It runs no
 * SQL, so a test reading its rows exercises the service's own logic; a test asserting the SQL itself reads it from the recorded calls.
 */
export function scriptedPostgres(results: unknown[][]): ScriptedPostgres {
  const queue = [...results];
  const calls: ChainCall[] = [];
  const chain = (call: ChainCall): object => {
    const proxy: object = new Proxy(() => undefined, {
      get: (_target, property) => {
        if (property === 'then') {
          return (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(queue.shift() ?? []).then(resolve, reject);
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
