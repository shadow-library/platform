/**
 * Importing npm packages
 */
import { useQueryClient } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { Link } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { Banner, toast } from '@shadow-library/ui';
import { createIDBPersister } from '@shadow-library/web/offline';
import { useOnlineStatus, useServiceWorker } from '@shadow-library/web/pwa';

/**
 * Importing user defined packages
 */
import { syncPendingProgress } from '@/lib/apis';

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
 * - whole-query-cache persistence into IndexedDB so previously-loaded screens render offline.
 */
const persister = createIDBPersister({ dbName: 'webnovel-query-cache' });
const PERSIST_MAX_AGE = 7 * 24 * 3_600_000;

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
      persister: persister as unknown as Parameters<typeof persistQueryClient>[0]['persister'],
      maxAge: PERSIST_MAX_AGE,
      buster: 'v1',
      dehydrateOptions: { shouldDehydrateQuery: query => query.state.status === 'success' },
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
    // Back online: revalidate everything on screen and push progress writes that queued while offline.
    void queryClient.invalidateQueries();
    void syncPendingProgress(true);
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
