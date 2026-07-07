/**
 * Importing npm packages
 */
import { forwardRef } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import styles from './Alert.module.css';
import { type AlertIntent, type AlertProps } from './Alert.types';

/**
 * Declaring the constants
 */
const GLYPH: Record<AlertIntent, string> = { info: 'i', success: '✓', warning: '!', danger: '!' };

function DismissIcon() {
  return (
    <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth={1.5} strokeLinecap='round' aria-hidden='true'>
      <path d='M4 4l8 8M12 4l-8 8' />
    </svg>
  );
}

/**
 * A persistent, in-layout message about a condition — the one intent-tinted surface, built entirely
 * from the semantic role tokens (so dark mode is automatic). It sits in the layout and stays while
 * the condition holds. Danger/warning announce via `role="alert"`; info/success via `role="status"`.
 * Every warning/danger names a way out through `action` or an inline link.
 */
export const Alert = forwardRef<HTMLDivElement, AlertProps>(function Alert({ intent = 'info', title, action, onDismiss, className, children, ...props }, ref) {
  const role = intent === 'danger' || intent === 'warning' ? 'alert' : 'status';
  return (
    <div ref={ref} className={cn(styles.root, className)} data-intent={intent} role={role} {...props}>
      <span className={styles.icon} aria-hidden='true'>
        {GLYPH[intent]}
      </span>
      <div className={styles.content}>
        {title != null ? <div className={styles.title}>{title}</div> : null}
        {children != null ? <div className={styles.body}>{children}</div> : null}
      </div>
      {action != null ? (
        <button type='button' className={styles.action} onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
      {onDismiss != null ? (
        <button type='button' className={styles.dismiss} aria-label='Dismiss' onClick={onDismiss}>
          <DismissIcon />
        </button>
      ) : null}
    </div>
  );
});
