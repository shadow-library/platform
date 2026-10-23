import { QueryClient } from '@tanstack/react-query';
import { createContext, type ReactElement, type ReactNode, useContext, useMemo } from 'react';
import { toISODate } from '@shadow-library/ui';

import { type AccountProvider, createAccountProvider } from './account.provider';
import { type DataProvider } from './data-provider';
import { type FinanceProvider, FixtureFinanceProvider, setFinanceProvider } from './finance.provider';
import { createFixtureProvider, type FixtureProviderOptions } from './fixture-provider';
import { type Persona, seed } from './fixtures';
import { createHeroProvider, type HeroProvider } from './hero.provider';
import { FixtureQuickLogProvider, type QuickLogProvider, setQuickLogProvider, setTodaySource } from './quick-logs.provider';
import { createReflectProvider, type ReflectProvider } from './reflect.provider';

export interface MemoirData {
  provider: DataProvider;
  hero: HeroProvider;
  reflect: ReflectProvider;
  account: AccountProvider;
  finance: FinanceProvider;
  quickLogs: QuickLogProvider;
  queryClient: QueryClient;
  today: string;
  persona: Persona;
}

/**
 * `networkMode: 'always'` is load-bearing: React Query's default pauses queries and mutations while offline, which would stop the local engine and
 * outbox exactly when they must run.
 */
export function memoirQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, networkMode: 'always' }, mutations: { networkMode: 'always' } } });
}

/** Finance and quick logs are reached through module-level singletons, so composing a `MemoirData` also installs them; building fixture data restores the fixture providers. */
export function createMemoirData(options: FixtureProviderOptions = {}): MemoirData {
  const today = options.today ?? toISODate(new Date());
  const persona = options.persona ?? 'active';
  const finance = new FixtureFinanceProvider();
  const quickLogs = new FixtureQuickLogProvider();
  setFinanceProvider(finance);
  setQuickLogProvider(quickLogs);
  setTodaySource();

  return {
    provider: createFixtureProvider(options),
    hero: createHeroProvider({ persona, hero: seed(today, persona).hero }),
    reflect: createReflectProvider({ today, persona }),
    account: createAccountProvider({ persona, currency: 'EUR' }),
    finance,
    quickLogs,
    queryClient: memoirQueryClient(),
    today,
    persona,
  };
}

/** Carries its own QueryClient so a day screen renders in isolation, without a surrounding QueryClientProvider. */
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
