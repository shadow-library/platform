/**
 * Importing npm packages
 */
import { type ReactElement, useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import styles from './Toast.module.css';
/**
 * Importing user defined packages
 */
import { toastStore } from './Toast.store';
import { type ToastData, type ToasterProps, type ToastIntent } from './Toast.types';

/**
 * Declaring the constants
 */
const DEFAULT_DURATION: Record<ToastIntent, number> = {
  neutral: 5000,
  info: 5000,
  success: 5000,
  warning: 8000,
  danger: Number.POSITIVE_INFINITY,
};

const GLYPH: Record<ToastIntent, string> = { neutral: '•', info: 'i', success: '✓', warning: '!', danger: '!' };

function DismissIcon() {
  return (
    <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth={1.5} strokeLinecap='round' aria-hidden='true'>
      <path d='M4 4l8 8M12 4l-8 8' />
    </svg>
  );
}

/** A single toast card — calm neutral surface, one colored glyph, timer paused on hover/focus. */
function ToastItem({ toast }: { toast: ToastData }): ReactElement {
  const [paused, setPaused] = useState(false);
  const duration = toast.duration ?? DEFAULT_DURATION[toast.intent];

  useEffect(() => {
    if (paused || toast.loading || !Number.isFinite(duration) || duration <= 0) return;
    const timer = setTimeout(() => toastStore.dismiss(toast.id), duration);
    return () => clearTimeout(timer);
  }, [paused, duration, toast.id, toast.loading]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the hover/focus handlers only pause the auto-dismiss timer (WCAG 2.2.1); the toast is not itself a control
    <div
      className={styles.toast}
      data-intent={toast.intent}
      role={toast.intent === 'danger' ? 'alert' : 'status'}
      aria-live={toast.intent === 'danger' ? 'assertive' : 'polite'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {toast.loading ? (
        <span className={styles.spinner} aria-hidden='true' />
      ) : (
        <span className={styles.icon} aria-hidden='true'>
          {GLYPH[toast.intent]}
        </span>
      )}
      <div className={styles.content}>
        <div className={styles.title}>{toast.title}</div>
        {toast.body != null ? <div className={styles.body}>{toast.body}</div> : null}
      </div>
      {toast.action != null ? (
        <button
          type='button'
          className={styles.action}
          onClick={() => {
            toast.action?.onClick();
            toastStore.dismiss(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      ) : null}
      <button type='button' className={styles.dismiss} aria-label='Dismiss' onClick={() => toastStore.dismiss(toast.id)}>
        <DismissIcon />
      </button>
    </div>
  );
}

/**
 * The toast viewport — render one at the app root. Subscribes to the toast store and portals the
 * stack into `document.body`, newest nearest the anchored corner, capped at `max`. Toasts never steal
 * focus; each carries its own live-region role (assertive for danger, polite otherwise).
 */
export function Toaster({ placement = 'top-end', max = 3 }: ToasterProps): ReactElement | null {
  const toasts = useSyncExternalStore(toastStore.subscribe, toastStore.getSnapshot, () => []);
  if (typeof document === 'undefined') return null;

  const visible = toasts.slice(-max);
  return createPortal(
    <div className={styles.viewport} data-placement={placement}>
      {visible.map(toast => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>,
    document.body,
  );
}
