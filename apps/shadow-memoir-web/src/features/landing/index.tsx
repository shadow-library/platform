import { type ReactElement } from 'react';
import { Button } from '@shadow-library/ui';

import { MemoirMark } from '@/components/icons';
import { loginUrl } from '@/lib/apis';

import styles from './landing.module.css';

export interface LandingScreenProps {
  /** Where the identity round trip returns the visitor. Already constrained to a same-origin path by the route. */
  returnTo: string;
}

/**
 * The signed-out state. Everything in Shadow Memoir is behind authentication and there is no marketing
 * surface, so this is the whole of the anonymous product: what it is, and one way in. The login link is a
 * document navigation to the backend's own OIDC route — never a router navigation, and never a fetch.
 */
export function LandingScreen({ returnTo }: LandingScreenProps): ReactElement {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.mark}>
            <MemoirMark size={22} />
          </span>
          <span className={styles.name}>Shadow Memoir</span>
        </div>
        <h1 className={styles.headline}>Your commitments, your money, your body, your thoughts — in one private place.</h1>
        <p className={styles.body}>
          Define the things you mean to do, and completing them advances your hero. Missing them does not punish you. Nothing here is shared, compared or ranked.
        </p>
        <div className={styles.actions}>
          <Button variant="primary" size="lg" onClick={() => window.location.assign(loginUrl(returnTo))}>
            Sign in
          </Button>
        </div>
        <p className={styles.footnote}>Sign-in uses your Shadow account. Your entries stay on your account and are never used to compare you with anyone.</p>
      </div>
    </main>
  );
}
