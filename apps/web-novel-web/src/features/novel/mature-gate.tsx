/**
 * Importing npm packages
 */
import { Link } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { AlertIcon } from '@/components/icons';
import { grantMatureConsent, hasMatureConsent, loadSettings } from '@/lib/settings-store';

import styles from './mature-gate.module.css';

/**
 * Defining types
 */
interface MatureGateProps {
  novelTitle: string;
  onContinue: () => void;
  onBack: () => void;
}

interface MatureGateState {
  gateVisible: boolean;
  reveal: () => void;
}

/**
 * Declaring the constants
 *
 * A full-screen blocking interstitial for mature titles, mirroring the design canvas's MATURE GATE. It sits
 * over the novel's content region and before the reader's chapter body; consent is per device, never synced.
 */

/**
 * Resolve whether a mature title must stay gated for this device. The decision depends on `localStorage`
 * (consent + the "show mature content" preference), which is unreadable during SSR and the first client
 * render — so a mature title starts gated on both, and an effect reveals it only once consent is known. That
 * keeps server and client markup identical and guarantees mature text is never present in the pre-consent
 * HTML. `reveal` records consent so the choice survives reloads and future visits.
 */
export function useMatureGate(mature: boolean): MatureGateState {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (!mature) return;
    setAllowed(loadSettings().showMatureContent || hasMatureConsent());
  }, [mature]);

  const reveal = useCallback((): void => {
    grantMatureConsent();
    setAllowed(true);
  }, []);

  return { gateVisible: mature && !allowed, reveal };
}

export function MatureGate({ novelTitle, onContinue, onBack }: MatureGateProps): React.JSX.Element {
  return (
    <div className={`${styles.gate} wn-fade`}>
      <div className={styles.inner}>
        <div className={styles.iconTile}>
          <AlertIcon size={28} />
        </div>
        <div className={styles.eyebrow}>Mature content</div>
        <h1 className={styles.title}>“{novelTitle}” is rated mature</h1>
        <p className={styles.body}>This novel contains themes and content intended for adult readers. Please confirm you’d like to continue.</p>
        <div className={styles.actions}>
          <Button variant="secondary" size="lg" onClick={onBack}>
            Take me back
          </Button>
          <Button variant="primary" size="lg" onClick={onContinue}>
            I’m 18+ · Continue
          </Button>
        </div>
        <Link to="/settings" search={{ section: 'content' }} className={styles.manageLink}>
          Manage content settings
        </Link>
      </div>
    </div>
  );
}
