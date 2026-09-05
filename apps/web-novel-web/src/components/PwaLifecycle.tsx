import { useQuery, useQueryClient } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { Link } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { Banner, toast } from '@shadow-library/ui';
import { purgeIfAccountChanged } from '@shadow-library/web/offline';
import { useOnlineStatus, useServiceWorker } from '@shadow-library/web/pwa';

import { sessionKeys, sessionQueryOptions, syncPendingProgress } from '@/lib/apis';
import { type SessionUser } from '@/lib/apis/types';
import { OFFLINE_DB_NAME, PERSIST_BUSTER, PERSIST_MAX_AGE, PURGE_CACHE_PREFIXES, queryPersister, shouldPersistQueryKey } from '@/lib/offline';

/** localStorage marker for the account whose on-device caches this browser holds — see {@link purgeIfAccountChanged}. */
const LAST_ACCOUNT_KEY = 'webnovel:last-account';

/**
 * The PWA plumbing, mounted once at the root:
 * - service worker registration with the prompt-then-reload update UX (never a surprise refresh),
 * - offline / reconnected banners driven by `useOnlineStatus`,
 * - refetch + reading-progress re-sync when connectivity returns,
 * - public-content query-cache persistence into IndexedDB so previously-loaded screens render offline
 *   (per-user state is denylisted by `shouldPersistQueryKey`, see `@/lib/offline/query-persister`).
 */

/**
 * Closes the account-bleed gap on a shared device: when the signed-in reader differs from the one this
 * browser last held, the downloaded-content database and the cache-first chapter cache are purged before the
 * next reader can open them. The first account seen is adopted (its downloads are its own), so a returning
 * reader keeps their offline library; every later change — to a guest or a different account — purges. Gated
 * on a settled session read so a transient boot-time fetch failure is never read as a sign-out that purges.
 */
function AccountScopeGuard(): null {
  const session = useQuery(sessionQueryOptions());
  const accountId = session.data?.userId ?? null;
  const settled = session.isSuccess;
  useEffect(() => {
    if (!settled) return;
    void purgeIfAccountChanged({ storageKey: LAST_ACCOUNT_KEY, accountId, databases: [OFFLINE_DB_NAME], cachePrefixes: [...PURGE_CACHE_PREFIXES] });
  }, [settled, accountId]);
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
      // The ecosystem persister types `clientState` as `unknown` (no extra peer dep); the shape is the
      // stable persist-client contract, so widening here is safe.
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
