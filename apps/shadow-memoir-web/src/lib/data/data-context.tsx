import { QueryClient } from '@tanstack/react-query';
import { createContext, type ReactElement, type ReactNode, useContext, useMemo } from 'react';
import { toISODate } from '@shadow-library/ui';

import { type AccountProvider, createAccountProvider } from './account.provider';
import { type DataProvider } from './data-provider';
import { type CurrencyCode } from './finance.types';
import { type FinanceProvider, FixtureFinanceProvider, setFinanceProvider } from './finance.provider';
import { createFixtureProvider, type FixtureProviderOptions } from './fixture-provider';
import { type Persona, seed } from './fixtures';
import { createHeroProvider, type HeroProvider } from './hero.provider';
import { FixtureQuickLogProvider, type QuickLogProvider, setQuickLogProvider } from './quick-logs.provider';
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
  currency: CurrencyCode;
  persona: Persona;
}

/**
 * Finance and quick logs are reached through module-level singletons rather than this context — their
 * query hooks predate it — so composing a `MemoirData` also installs them. Building the fixture data is
 * what puts the fixture providers back, which is how a story or a component test undoes a sync flip.
 */
export function createMemoirData(options: FixtureProviderOptions = {}): MemoirData {
  const today = options.today ?? toISODate(new Date());
  const persona = options.persona ?? 'active';
  const currency = 'EUR';
  const finance = new FixtureFinanceProvider();
  const quickLogs = new FixtureQuickLogProvider();
  setFinanceProvider(finance);
  setQuickLogProvider(quickLogs);

  return {
    provider: createFixtureProvider(options),
    hero: createHeroProvider({ persona, hero: seed(today, persona).hero }),
    reflect: createReflectProvider({ today, persona }),
    account: createAccountProvider({ persona, currency }),
    finance,
    quickLogs,
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } }),
    today,
    currency,
    persona,
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
