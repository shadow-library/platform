import { Banner } from '@shadow-library/ui';
import { useBuildUpdate } from '@shadow-library/web';

import { BUILD_ID } from '@/lib/build-id';

import styles from './UpdateBar.module.css';

/** Vite's dev server already reloads the page whenever it restarts, so only a built deploy is watched. */
export function UpdateBar(): React.JSX.Element | null {
  const { updateAvailable, reload, dismiss } = useBuildUpdate({ buildId: BUILD_ID, enabled: !import.meta.env.DEV });
  if (!updateAvailable) return null;

  return (
    <div className={styles.dock}>
      <Banner
        className={styles.bar}
        message="Novel Forge has been updated. Reload to get the latest version."
        action={{ label: 'Reload', onClick: reload }}
        dismissable
        onDismiss={dismiss}
      />
    </div>
  );
}
