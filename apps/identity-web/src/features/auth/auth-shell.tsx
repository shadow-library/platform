/**
 * Importing npm packages
 */
import { type ReactNode } from 'react';

/**
 * Importing user defined packages
 */
import { CheckIcon, LockIcon } from '@/components/icons';

import styles from './auth-shell.module.css';

/**
 * Defining types
 */
interface AuthScreenProps {
  children: ReactNode;
  /** Page-specific footer row (e.g. "New to Shadow? Create an account"). */
  footer?: ReactNode;
}

/**
 * Declaring the constants
 */
const BRAND_POINTS = ['Phishing-resistant passkeys', 'Enterprise SSO & SCIM provisioning', 'SOC 2 Type II · ISO 27001'];

function BrandGlyph({ size = 26, onAccent = false }: { size?: number; onAccent?: boolean }): React.JSX.Element {
  const back = onAccent ? 'rgba(255,255,255,0.28)' : 'var(--sh-accent-soft)';
  const front = onAccent ? 'var(--sh-on-accent)' : 'var(--sh-accent)';
  const mark = onAccent ? 'var(--sh-accent)' : 'var(--sh-on-accent)';
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect x="7" y="7" width="17" height="17" rx="5" fill={back} />
      <rect x="3" y="3" width="17" height="17" rx="5" fill={front} />
      <circle cx="11.5" cy="10.2" r="2.5" fill={mark} />
      <path d="M10.4 11.8 12.6 11.8 13.4 16 9.6 16 Z" fill={mark} />
    </svg>
  );
}

/** The indigo marketing rail shown beside every hosted-auth form (hidden on narrow viewports). */
function AuthBrandPanel(): React.JSX.Element {
  return (
    <div className={styles.brandPanel} aria-hidden="true">
      <div className={styles.blobA} />
      <div className={styles.blobB} />
      <div className={styles.brandPanelTop}>
        <BrandGlyph size={30} onAccent />
        <span className={styles.brandPanelName}>Shadow Identity</span>
      </div>
      <div className={styles.brandPanelBody}>
        <h2 className={styles.brandHeadline}>One identity for the whole ecosystem.</h2>
        <p className={styles.brandSub}>Sign in once to reach every app on shadow-apps.com — secured with passkeys, enterprise SSO, and strong two-factor by default.</p>
        <div className={styles.brandPoints}>
          {BRAND_POINTS.map(point => (
            <div key={point} className={styles.brandPoint}>
              <CheckIcon size={16} strokeWidth={2.4} />
              {point}
            </div>
          ))}
        </div>
      </div>
      <div className={styles.brandPanelFoot}>
        <span>© 2026 Shadow, Inc.</span>
        <span>Privacy</span>
        <span>Terms</span>
      </div>
    </div>
  );
}

/** The split-screen chrome for the hosted-auth pages: brand rail + a centred form column. */
export function AuthScreen({ children, footer }: AuthScreenProps): React.JSX.Element {
  return (
    <div className={styles.screen}>
      <AuthBrandPanel />
      <div className={styles.formCol}>
        <div className={styles.brandMark}>
          <BrandGlyph size={26} />
          <span className={styles.brandMarkName}>
            Shadow <span className={styles.brandMarkSub}>Identity</span>
          </span>
        </div>
        <div className={styles.formMain}>{children}</div>
        <div className={styles.formFoot}>
          {footer}
          <div className={styles.secured}>
            <LockIcon size={12} />
            Secured by Shadow Identity
          </div>
        </div>
      </div>
    </div>
  );
}

/** The rounded surface card the auth steps render inside. */
export function AuthCard({ children, className }: { children: ReactNode; className?: string }): React.JSX.Element {
  return <div className={`${styles.card}${className ? ` ${className}` : ''}`}>{children}</div>;
}

/** A centred icon medallion (passkey prompt, lock-out, success). */
export function AuthMedallion({ children, intent = 'accent' }: { children: ReactNode; intent?: 'accent' | 'danger' | 'success' | 'warning' | 'neutral' }): React.JSX.Element {
  return (
    <div className={styles.medallion} data-intent={intent}>
      {children}
    </div>
  );
}
