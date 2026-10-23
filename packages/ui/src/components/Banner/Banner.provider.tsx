import { type ReactElement, useEffect, useSyncExternalStore } from 'react';

import { Banner } from './Banner';
import styles from './Banner.module.css';
import { bannerStore } from './Banner.store';
import { type BannerConfig } from './Banner.types';

/** Registers an app-level banner for as long as `when` holds; the provider owns severity ordering, the one-visible queue and dismissal memory. */
export function useBanner(config: BannerConfig): void {
  const { id, intent, message, lead, dismissable, when } = config;
  const actionLabel = config.action?.label;
  const actionHref = config.action?.href;
  const actionLoading = config.action?.loading;

  useEffect(() => {
    bannerStore.register(config);
    return () => bannerStore.unregister(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are the individual config fields, spread to avoid churn on a fresh object literal each render
  }, [id, intent, message, lead, dismissable, when, actionLabel, actionHref, actionLoading]);
}

/** Renders the highest-severity active banner, pushing content down rather than covering it. Place one above the header. */
export function BannerOutlet(): ReactElement {
  const current = useSyncExternalStore(bannerStore.subscribe, bannerStore.getSnapshot, () => null);

  return (
    <div className={styles.outlet} data-open={current ? true : undefined}>
      <div className={styles.outletInner}>
        {current ? (
          <Banner
            intent={current.intent}
            message={current.message}
            lead={current.lead}
            action={current.action}
            dismissable={current.dismissable}
            onDismiss={() => bannerStore.dismiss(current.id)}
          />
        ) : null}
      </div>
    </div>
  );
}
