import { type ReactElement, type ReactNode, useEffect, useRef } from 'react';
import { BottomSheet, type BottomSheetSnap, Dialog, useMediaQuery } from '@shadow-library/ui';

import styles from './OverlaySurface.module.css';

function isFocusable(target: HTMLElement | null | undefined): target is HTMLElement {
  return target != null && target !== document.body && target.isConnected;
}

export interface OverlaySurfaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Element to refocus once the overlay closes. Unset, `document.body`, or disconnected leaves the default (Radix/browser) behaviour alone. */
  restoreFocusTo?: HTMLElement | null;
  /** Dialog-only: override the element Radix focuses on open (BottomSheet has no equivalent hook). */
  onOpenAutoFocus?: (event: Event) => void;
  /** BottomSheet snap points (touch layout only). @default ['content'] */
  sheetSnapPoints?: BottomSheetSnap[];
  /** BottomSheet initial snap (touch layout only). @default the first of sheetSnapPoints */
  sheetDefaultSnap?: BottomSheetSnap;
  children: ReactNode;
}

/**
 * One overlay for both surfaces: a thumb-reachable sheet under 640px on a coarse pointer, the dialog the
 * same content deserves on a desktop viewport. Callers describe the content, never the presentation.
 */
export function OverlaySurface({
  open,
  onOpenChange,
  title,
  description,
  footer,
  size = 'sm',
  restoreFocusTo,
  onOpenAutoFocus,
  sheetSnapPoints = ['content'],
  sheetDefaultSnap,
  children,
}: OverlaySurfaceProps): ReactElement {
  const isTouchLayout = useMediaQuery('(max-width: 639px)');
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  // BottomSheet has no onCloseAutoFocus, so the touch surface restores focus itself here, deferred a tick.
  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (open && !wasOpen) {
      openerRef.current = restoreFocusTo ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      return undefined;
    }
    if (!open && wasOpen && isTouchLayout) {
      const target = openerRef.current;
      const timer = setTimeout(() => {
        if (isFocusable(target)) target.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [open, restoreFocusTo, isTouchLayout]);

  const wrappedTitle = <span className={styles.title}>{title}</span>;

  if (isTouchLayout)
    return (
      <BottomSheet open={open} onOpenChange={onOpenChange} title={wrappedTitle} footer={footer} snapPoints={sheetSnapPoints} defaultSnap={sheetDefaultSnap}>
        {description ? <p className="text-secondary text-body-sm">{description}</p> : null}
        {children}
      </BottomSheet>
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content
        size={size}
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={event => {
          const target = openerRef.current;
          if (!isFocusable(target)) return;
          event.preventDefault();
          target.focus();
        }}
      >
        <Dialog.Header title={wrappedTitle} description={description} />
        <Dialog.Body>{children}</Dialog.Body>
        {footer ? <Dialog.Footer>{footer}</Dialog.Footer> : null}
      </Dialog.Content>
    </Dialog>
  );
}
