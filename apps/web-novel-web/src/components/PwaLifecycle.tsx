/**
 * Importing npm packages
 */
import { useQueryClient } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { Link } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { Banner, toast } from '@shadow-library/ui';
import { useOnlineStatus, useServiceWorker } from '@shadow-library/web/pwa';

/**
 * Importing user defined packages
 */
import { sessionKeys, syncPendingProgress } from '@/lib/apis';
import { type SessionUser } from '@/lib/apis/types';
import { PERSIST_BUSTER, PERSIST_MAX_AGE, queryPersister, shouldPersistQueryKey } from '@/lib/offline';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The PWA plumbing, mounted once at the root:
 * - service worker registration with the prompt-then-reload update UX (never a surprise refresh),
 * - offline / reconnected banners driven by `useOnlineStatus`,
 * - refetch + reading-progress re-sync when connectivity returns,
 * - public-content query-cache persistence into IndexedDB so previously-loaded screens render offline
 *   (per-user state is denylisted by `shouldPersistQueryKey`, see `@/lib/offline/query-persister`).
 */

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
    // Back online: revalidate everything on screen and push the signed-in user's progress writes that queued while offline.
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
      {import.meta.env.PROD && <SwUpdateBanner />}
      <ConnectivityBanners />
      <QueryCachePersistence />
    </>
  );
}
