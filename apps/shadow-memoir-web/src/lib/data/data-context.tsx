import { QueryClient } from '@tanstack/react-query';
import { createContext, type ReactElement, type ReactNode, useContext, useMemo } from 'react';
import { toISODate } from '@shadow-library/ui';

import { type DataProvider } from './data-provider';
import { createFixtureProvider, type FixtureProviderOptions } from './fixture-provider';

export interface MemoirData {
  provider: DataProvider;
  queryClient: QueryClient;
  today: string;
  currency: string;
}

function createMemoirData(options: FixtureProviderOptions = {}): MemoirData {
  return {
    provider: createFixtureProvider(options),
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } }),
    today: options.today ?? toISODate(new Date()),
    currency: 'EUR',
  };
}

/**
 * The seam carries its own QueryClient so a day screen renders in isolation — a story, a component test, or
 * a route mounted before the sync provider exists — without a surrounding QueryClientProvider.
 */
const MemoirDataContext = createContext<MemoirData>(createMemoirData());

export interface MemoirDataProviderProps extends FixtureProviderOptions {
  value?: MemoirData;
  children: ReactNode;
}

export function MemoirDataProvider({ value, today, persona, children }: MemoirDataProviderProps): ReactElement {
  const data = useMemo(() => value ?? createMemoirData({ today, persona }), [value, today, persona]);
  return <MemoirDataContext.Provider value={data}>{children}</MemoirDataContext.Provider>;
}

export function useMemoirData(): MemoirData {
  return useContext(MemoirDataContext);
}
