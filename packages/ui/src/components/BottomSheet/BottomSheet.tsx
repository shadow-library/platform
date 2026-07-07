/**
 * Importing npm packages
 */
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { type CSSProperties, type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import styles from './BottomSheet.module.css';
import { type BottomSheetProps, type BottomSheetSnap } from './BottomSheet.types';

/**
 * Declaring the constants
 */
const FLICK_VELOCITY = 0.5; // px/ms — a downward flick past this dismisses from any height
const RUBBER_BAND = 0.4; // resistance factor when dragging past the tallest snap

interface DragState {
  active: boolean;
  pointerId: number;
  startY: number;
  startHeight: number;
  lastY: number;
  lastT: number;
  velocity: number;
}

const SNAP_LABEL: Record<BottomSheetSnap, string> = { content: 'content height', half: 'half height', full: 'full height' };

/**
 * The touch-native overlay: a surface that rises from the bottom edge with snap points, drag-to-dismiss,
 * and a grabber. Drag is never the only path — the grabber is a focusable button that cycles the snap
 * points, so the gesture has a keyboard twin. Modal sheets reuse Dialog's focus trap, scrim, and scroll
 * lock. Above md, prefer a Dialog or Popover; this is the thumb-reachable projection target below it.
 */
export function BottomSheet({
  open,
  onOpenChange,
  snapPoints = ['content'],
  defaultSnap,
  modal = true,
  dismissable = true,
  title,
  headerAction,
  footer,
  'aria-label': ariaLabel,
  children,
  className,
}: BottomSheetProps) {
  const startIndex = Math.max(0, defaultSnap ? snapPoints.indexOf(defaultSnap) : 0);
  const [snapIndex, setSnapIndex] = useState(startIndex);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState>({ active: false, pointerId: -1, startY: 0, startHeight: 0, lastY: 0, lastT: 0, velocity: 0 });

  // Reset to the initial snap each time the sheet opens.
  useEffect(() => {
    if (open) {
      setSnapIndex(startIndex);
      setOffset(0);
    }
  }, [open, startIndex]);

  const snap = snapPoints[snapIndex] ?? 'content';
  const showGrabber = dismissable || snapPoints.length > 1;

  function cycleSnap(direction: 1 | -1): void {
    setSnapIndex(index => {
      const next = index + direction;
      if (next < 0 || next >= snapPoints.length) return direction === 1 ? 0 : snapPoints.length - 1;
      return next;
    });
  }

  function onGrabberKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      cycleSnap(1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      cycleSnap(-1);
    }
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0 || !surfaceRef.current) return;
    const now = performance.now();
    drag.current = { active: true, pointerId: event.pointerId, startY: event.clientY, startHeight: surfaceRef.current.clientHeight, lastY: event.clientY, lastT: now, velocity: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>): void {
    const state = drag.current;
    if (!state.active) return;
    const now = performance.now();
    const dt = now - state.lastT;
    if (dt > 0) state.velocity = (event.clientY - state.lastY) / dt;
    state.lastY = event.clientY;
    state.lastT = now;
    const dy = event.clientY - state.startY;
    setOffset(dy < 0 ? dy * RUBBER_BAND : dy);
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>): void {
    const state = drag.current;
    if (!state.active) return;
    state.active = false;
    setDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
    const { velocity, startHeight } = state;
    const moved = offset;
    setOffset(0);

    if (moved > 0) {
      const dismiss = velocity > FLICK_VELOCITY || moved > startHeight * 0.4;
      if (!dismiss) return;
      if (snapIndex === 0) {
        if (dismissable) onOpenChange(false);
      } else {
        setSnapIndex(index => Math.max(0, index - 1));
      }
    } else if (moved < 0) {
      const expand = velocity < -FLICK_VELOCITY || -moved > startHeight * 0.2;
      if (expand) setSnapIndex(index => Math.min(snapPoints.length - 1, index + 1));
    }
  }

  const surfaceStyle = { '--sheet-offset': `${offset}px` } as CSSProperties;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={next => (!next && !dismissable ? undefined : onOpenChange(next))} modal={modal}>
      <DialogPrimitive.Portal>
        {modal ? <DialogPrimitive.Overlay className={styles.scrim} /> : null}
        <DialogPrimitive.Content
          ref={surfaceRef}
          className={cn(styles.surface, className)}
          data-snap={snap}
          data-dragging={dragging || undefined}
          style={surfaceStyle}
          aria-label={title == null ? ariaLabel : undefined}
          onEscapeKeyDown={dismissable ? undefined : event => event.preventDefault()}
          onPointerDownOutside={dismissable ? undefined : event => event.preventDefault()}
        >
          <div className={styles.handle} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
            {showGrabber ? (
              <button type='button' className={styles.grabber} aria-label={`Resize sheet, ${SNAP_LABEL[snap]}`} onClick={() => cycleSnap(1)} onKeyDown={onGrabberKeyDown} />
            ) : null}
            {title != null || headerAction != null ? (
              <div className={styles.header}>
                <DialogPrimitive.Title className={title != null ? styles.title : styles.srOnly}>{title ?? ariaLabel ?? 'Sheet'}</DialogPrimitive.Title>
                {headerAction != null ? <div className={styles.headerAction}>{headerAction}</div> : null}
              </div>
            ) : (
              <DialogPrimitive.Title className={styles.srOnly}>{ariaLabel ?? 'Sheet'}</DialogPrimitive.Title>
            )}
          </div>

          <div className={styles.content}>{children}</div>

          {footer != null ? <div className={styles.footer}>{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
