import { useQuery, useQueryClient } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { Banner, toast } from '@shadow-library/ui';
import { purgeIfAccountChanged } from '@shadow-library/web/offline';
import { useOnlineStatus, useServiceWorker } from '@shadow-library/web/pwa';

import { sessionKeys, sessionQueryOptions, syncPendingProgress } from '@/lib/apis';
import { type SessionUser } from '@/lib/apis/types';
import { OFFLINE_DB_NAME, PERSIST_BUSTER, PERSIST_MAX_AGE, PURGE_CACHE_PREFIXES, queryPersister, shouldPersistQueryKey, shouldReconcileAccount } from '@/lib/offline';

/** localStorage marker for the account whose on-device caches this browser holds — see {@link purgeIfAccountChanged}. */
const LAST_ACCOUNT_KEY = 'webnovel:last-account';

const rootRoute = getRouteApi('__root__');

/** Purges downloads and cached chapters when the signed-in account differs from the last one seen on this device; the first account seen is adopted. */
/** Only a session this page fetched decides: a failed fetch, or a session hydrated from the precached shell (a previous reader's), must never purge. */
function AccountScopeGuard(): null {
  const accessMode = rootRoute.useRouteContext({ select: context => context.accessMode });
  const session = useQuery({ ...sessionQueryOptions(), refetchOnMount: 'always' });
  const accountId = session.data?.userId ?? null;
  const reconcile = shouldReconcileAccount({ fetchedThisPage: session.isSuccess && session.isFetchedAfterMount, accountId, accessMode });
  useEffect(() => {
    if (!reconcile) return;
    void purgeIfAccountChanged({ storageKey: LAST_ACCOUNT_KEY, accountId, databases: [OFFLINE_DB_NAME], cachePrefixes: [...PURGE_CACHE_PREFIXES] });
  }, [reconcile, accountId]);
  return null;
}

function SwUpdateBanner(): React.JSX.Element | null {
  const { updateAvailable, applyUpdate } = useServiceWorker({ url: '/sw.js' });
  if (!updateAvailable) return null;
  return <Banner intent="info" lead="Update ready." message="A new version of Shadow Webnovel is available." action={{ label: 'Refresh', onClick: applyUpdate }} />;
}

function QueryCachePersistence(): null {
  const queryClient = useQueryClient();
  useEffect(() => {
    const [unsubscribe] = persistQueryClient({
      queryClient,
      // The ecosystem persister types `clientState` as `unknown`; the persist-client shape is stable, so widening is safe.
      persister: queryPersister as unknown as Parameters<typeof persistQueryClient>[0]['persister'],
      maxAge: PERSIST_MAX_AGE,
      buster: PERSIST_BUSTER,
      // Only public catalog/chapter content reaches disk — session, library and progress carry PII and are denylisted.
      dehydrateOptions: { shouldDehydrateQuery: query => query.state.status === 'success' && shouldPersistQueryKey(query.queryKey) },
    });
    return unsubscribe;
  }, [queryClient]);
  return null;
}

function ConnectivityBanners(): React.JSX.Element | null {
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    void queryClient.invalidateQueries();
    void syncPendingProgress(queryClient.getQueryData<SessionUser | null>(sessionKeys.session)?.userId);
    toast.success('Back online — syncing your library and progress.');
  }, [online, queryClient]);

  if (online) return null;
  return (
    <Banner
      intent="warning"
      message={
        <>
          You’re offline. Showing downloaded content and cached pages. <Link to="/downloads">Offline library</Link>
        </>
      }
    />
  );
}

export function PwaLifecycle(): React.JSX.Element {
  return (
    <>
      <AccountScopeGuard />
      {import.meta.env.PROD && <SwUpdateBanner />}
      <ConnectivityBanners />
      <QueryCachePersistence />
    </>
  );
}
