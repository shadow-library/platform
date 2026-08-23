import { type ReactElement } from 'react';
import { Banner } from '@shadow-library/ui';
import { useOnlineStatus, useServiceWorker } from '@shadow-library/web/pwa';

/**
 * The PWA plumbing, mounted once at the root: service-worker registration with the prompt-then-reload update
 * model (never a surprise refresh mid-entry), and the offline banner. The install prompt is deliberately not
 * here — it belongs after the first delivered value, not on arrival (PRODUCT.md §6.6); `useInstallOffer`
 * carries that rule.
 */
function SwUpdateBanner(): ReactElement | null {
  const { updateAvailable, applyUpdate } = useServiceWorker({ url: '/sw.js' });
  if (!updateAvailable) return null;
  return <Banner intent="info" lead="Update ready." message="A new version of Shadow Memoir is available." action={{ label: 'Refresh', onClick: applyUpdate }} />;
}

function OfflineBanner(): ReactElement | null {
  const online = useOnlineStatus();
  if (online) return null;
  return <Banner intent="info" message="Offline. Your entries are saved on this device and will sync when a connection returns." />;
}

export function PwaLifecycle(): ReactElement {
  return (
    <>
      {import.meta.env.PROD && <SwUpdateBanner />}
      <OfflineBanner />
    </>
  );
}
