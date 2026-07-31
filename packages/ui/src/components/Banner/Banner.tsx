/**
 * Importing npm packages
 */
import { forwardRef, type ReactElement } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import { IconButton } from '../IconButton';
import { Spinner } from '../Spinner';
import styles from './Banner.module.css';
import { type BannerIntent, type BannerProps } from './Banner.types';

/**
 * Declaring the constants
 */
const INTENT_PREFIX: Record<BannerIntent, string> = { info: '', success: '', warning: 'Warning: ', danger: 'Error: ' };

const INTENT_GLYPH: Record<BannerIntent, ReactElement> = {
  success: (
    <>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M5.5 8.2l1.8 1.8 3.2-3.6" />
    </>
  ),
  warning: (
    <>
      <path d="M8 2.2 1.6 13h12.8L8 2.2Z" />
      <path d="M8 6.5v3M8 11.4v.1" />
    </>
  ),
  danger: (
    <>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 5v3.4M8 10.8v.1" />
    </>
  ),
  info: (
    <>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 7.4v3.2M8 5.2v.1" />
    </>
  ),
};

function IntentIcon({ intent }: { intent: BannerIntent }): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {INTENT_GLYPH[intent]}
    </svg>
  );
}

function DismissIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

/**
 * The app-scoped message strip — full-width chrome pinned above the shell content for facts affecting
 * the whole session (outages, expiring trials, unpaid invoices, impersonation). One sentence, one
 * optional action. Danger is `role="alert"` (announced assertively on arrival); the rest are polite
 * `role="status"`. The strip itself is never clickable — the action is the action.
 */
export const Banner = forwardRef<HTMLDivElement, BannerProps>(function Banner(
  { intent = 'info', message, lead, action, dismissable = false, onDismiss, className, ...props },
  ref,
) {
  const actionSpinner = action?.loading === true;
  const ActionTag = action?.href ? 'a' : 'button';

  return (
    <div
      ref={ref}
      className={cn(styles.strip, className)}
      data-intent={intent}
      role={intent === 'danger' ? 'alert' : 'status'}
      aria-live={intent === 'danger' ? 'assertive' : 'polite'}
      {...props}
    >
      <span className={styles.icon}>
        <IntentIcon intent={intent} />
      </span>
      <span className={styles.message}>
        {INTENT_PREFIX[intent] ? <span className={styles.srOnly}>{INTENT_PREFIX[intent]}</span> : null}
        {lead != null ? <span className={styles.lead}>{lead}</span> : null}
        {lead != null ? ' ' : null}
        {message}
      </span>
      {action != null ? (
        <ActionTag
          className={styles.action}
          href={action.href}
          type={action.href ? undefined : 'button'}
          onClick={action.onClick}
          aria-busy={actionSpinner || undefined}
          data-loading={actionSpinner || undefined}
        >
          {actionSpinner ? <Spinner size="sm" /> : action.label}
        </ActionTag>
      ) : null}
      {dismissable ? <IconButton className={styles.dismiss} size="sm" variant="ghost" icon={<DismissIcon />} aria-label="Dismiss notice" onClick={onDismiss} /> : null}
    </div>
  );
});
