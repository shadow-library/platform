export interface SingleFlight {
  readonly busy: boolean;
  /** Runs the task unless one is already in flight, in which case it resolves undefined without running it. */
  run: <T>(task: () => Promise<T>) => Promise<T | undefined>;
}

/** The flag is set before the task's first await, so a second click in the same tick is already refused. */
export function singleFlight(): SingleFlight {
  let busy = false;
  return {
    get busy() {
      return busy;
    },
    run: async task => {
      if (busy) return undefined;
      busy = true;
      try {
        return await task();
      } finally {
        busy = false;
      }
    },
  };
}
