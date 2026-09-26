import { useCallback, useState } from 'react';

import { singleFlight } from '@/lib/single-flight';

export interface SingleFlightController {
  /** True from the click to the end of the write, including the save it waits for first. */
  busy: boolean;
  run: <T>(task: () => Promise<T>) => Promise<T | undefined>;
}

export function useSingleFlight(): SingleFlightController {
  const [flight] = useState(singleFlight);
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    <T>(task: () => Promise<T>): Promise<T | undefined> =>
      flight.run(async () => {
        setBusy(true);
        try {
          return await task();
        } finally {
          setBusy(false);
        }
      }),
    [flight],
  );
  return { busy, run };
}
