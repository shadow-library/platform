import { type ReactElement } from 'react';
import { Banner } from '@shadow-library/ui';
import { useServiceWorker } from '@shadow-library/web/pwa';

/**
 * The PWA plumbing, mounted once at the root: service-worker registration with the prompt-then-reload update
 * model (never a surprise refresh mid-entry). The install prompt is deliberately not here — it belongs after the first delivered value, not on arrival (PRODUCT.md §6.6); `useInstallOffer`
 * carries that rule.
 */
function SwUpdateBanner(): ReactElement | null {
  const { updateAvailable, applyUpdate } = useServiceWorker({ url: '/sw.js' });
  if (!updateAvailable) return null;
  return <Banner intent="info" lead="Update ready." message="A new version of Shadow Memoir is available." action={{ label: 'Refresh', onClick: applyUpdate }} />;
}

export function PwaLifecycle(): ReactElement | null {
  return import.meta.env.PROD ? <SwUpdateBanner /> : null;
}
