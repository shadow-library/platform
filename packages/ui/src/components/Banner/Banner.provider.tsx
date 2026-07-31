/**
 * Importing npm packages
 */
import { type ReactElement, useEffect, useSyncExternalStore } from 'react';

/**
 * Importing user defined packages
 */
import { Banner } from './Banner';
import styles from './Banner.module.css';
import { bannerStore } from './Banner.store';
import { type BannerConfig } from './Banner.types';

/**
 * Declaring the constants
 */

/**
 * Declaratively register an app-level banner. The provider owns severity ordering, the one-visible
 * queue, and dismissal memory — call sites just describe the condition. `when` ties the banner's
 * lifetime to its condition; toggling it to `false` withdraws the banner and reveals the next in queue.
 */
export function useBanner(config: BannerConfig): void {
  const { id, intent, message, lead, dismissable, when } = config;
  const actionLabel = config.action?.label;
  const actionHref = config.action?.href;
  const actionLoading = config.action?.loading;

  // the config object is re-registered whenever any registered field changes; deps are spread to avoid churn on a fresh object literal each render
  useEffect(() => {
    bannerStore.register(config);
    return () => bannerStore.unregister(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are the individual config fields, spread to avoid churn on a fresh object literal each render
  }, [id, intent, message, lead, dismissable, when, actionLabel, actionHref, actionLoading]);
}

/**
 * Renders the highest-severity active banner into the App Shell's banner slot, expanding height to push
 * content down rather than cover it. Place one `<BannerOutlet />` above the header; the queue handles
 * the rest.
 */
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
