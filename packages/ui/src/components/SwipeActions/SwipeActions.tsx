/**
 * Importing npm packages
 */
import { createContext, type CSSProperties, forwardRef, type KeyboardEvent, type MouseEvent, type PointerEvent, useContext, useEffect, useRef, useState } from 'react';

/**
 * Importing user defined packages
 */
import { useIsomorphicLayoutEffect } from '@/hooks';
import { cn, mergeRefs } from '@/lib';

import styles from './SwipeActions.module.css';
import { type SwipeActionsActionProps, type SwipeActionsProps, type SwipeActionsSide } from './SwipeActions.types';

/**
 * Defining types
 */
interface SwipeActionsContextValue {
  openSide: SwipeActionsSide | null;
  close: () => void;
}

interface DragState {
  active: boolean;
  swiping: boolean;
  pointerId: number;
  startX: number;
  startY: number;
  startOffset: number;
  offset: number;
}

/**
 * Declaring the constants
 */
const DIRECTION_SLOP = 8; // px of travel before the gesture commits to swipe vs scroll
const RUBBER_BAND = 0.25; // resistance past the rail's full width
const FULL_SWIPE_FRACTION = 0.6; // fraction of the row width that commits the first action

const SwipeActionsContext = createContext<SwipeActionsContextValue | null>(null);
const SwipeActionsSideContext = createContext<SwipeActionsSide | null>(null);

/**
 * The list-row swipe: dragging the row horizontally reveals a leading/trailing rail of solid
 * action buttons, settling open past half the rail's width (optionally committing the first
 * action on a full swipe). The gesture is never the only path — the row is a tab stop where
 * ArrowLeft/ArrowRight open the rails (moving focus onto the first action) and Escape closes.
 * A closed rail is out of the accessibility tree; the row surface covers it visually.
 */
const SwipeActionsRoot = forwardRef<HTMLDivElement, SwipeActionsProps>(function SwipeActions(
  { leading, trailing, open: openProp, defaultOpen = null, onOpenChange, fullSwipe = false, className, style, children, ...props },
  ref,
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const leadingRef = useRef<HTMLDivElement>(null);
  const trailingRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState>({ active: false, swiping: false, pointerId: -1, startX: 0, startY: 0, startOffset: 0, offset: 0 });
  const focusRailOnOpen = useRef(false);

  const isControlled = openProp !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState<SwipeActionsSide | null>(defaultOpen);
  const openSide = isControlled ? openProp : uncontrolledOpen;

  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [leadingWidth, setLeadingWidth] = useState(0);
  const [trailingWidth, setTrailingWidth] = useState(0);

  useIsomorphicLayoutEffect(() => {
    setLeadingWidth(leadingRef.current?.offsetWidth ?? 0);
    setTrailingWidth(trailingRef.current?.offsetWidth ?? 0);
  }, [leading, trailing]);

  function setOpen(next: SwipeActionsSide | null): void {
    if (!isControlled) setUncontrolledOpen(next);
    if (next !== openSide) onOpenChange?.(next);
  }

  function close(): void {
    setOpen(null);
    contentRef.current?.focus();
  }

  // Keyboard opens land focus on the rail's first action once it re-enters the accessibility tree.
  useEffect(() => {
    if (!focusRailOnOpen.current || openSide == null) return;
    focusRailOnOpen.current = false;
    const rail = openSide === 'leading' ? leadingRef.current : trailingRef.current;
    rail?.querySelector('button')?.focus();
  }, [openSide]);

  function openWithFocus(side: SwipeActionsSide): void {
    focusRailOnOpen.current = true;
    setOpen(side);
  }

  // Lives on the root so Escape also reaches it from a focused rail action (a sibling of the row surface).
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      if (openSide != null) {
        event.preventDefault();
        close();
      }
      return;
    }
    if (event.target !== contentRef.current) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (openSide === 'leading') close();
      else if (trailing != null) openWithFocus('trailing');
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (openSide === 'trailing') close();
      else if (leading != null) openWithFocus('leading');
    }
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const settled = openSide === 'leading' ? leadingWidth : openSide === 'trailing' ? -trailingWidth : 0;
    drag.current = { active: true, swiping: false, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startOffset: settled, offset: settled };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>): void {
    const state = drag.current;
    if (!state.active) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;

    if (!state.swiping) {
      // Direction lock: mostly-vertical travel is a scroll, not a swipe.
      if (Math.abs(dy) > DIRECTION_SLOP && Math.abs(dy) > Math.abs(dx)) {
        state.active = false;
        return;
      }
      if (Math.abs(dx) < DIRECTION_SLOP) return;
      state.swiping = true;
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    const max = leading != null ? leadingWidth : 0;
    const min = trailing != null ? -trailingWidth : 0;
    const raw = state.startOffset + dx;
    let next = raw;
    if (raw > max) next = max + (raw - max) * RUBBER_BAND;
    else if (raw < min) next = min + (raw - min) * RUBBER_BAND;
    state.offset = next;
    setDragOffset(next);
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>): void {
    const state = drag.current;
    if (!state.active) return;
    state.active = false;
    if (!state.swiping) return;
    setDragging(false);
    setDragOffset(null);
    event.currentTarget.releasePointerCapture(event.pointerId);

    const { offset } = state;
    const rowWidth = rootRef.current?.clientWidth ?? 0;
    if (fullSwipe && rowWidth > 0) {
      const commitRail = offset <= -rowWidth * FULL_SWIPE_FRACTION ? trailingRef.current : offset >= rowWidth * FULL_SWIPE_FRACTION ? leadingRef.current : null;
      const commitAction = commitRail?.querySelector('button');
      if (commitAction) {
        commitAction.click();
        return;
      }
    }

    if (offset < 0 && trailing != null && -offset >= trailingWidth / 2) setOpen('trailing');
    else if (offset > 0 && leading != null && offset >= leadingWidth / 2) setOpen('leading');
    else setOpen(null);
  }

  const translate = dragOffset ?? (openSide === 'leading' ? leadingWidth : openSide === 'trailing' ? -trailingWidth : 0);
  const rootStyle = { '--swipe-offset': `${translate}px`, ...style } as CSSProperties;

  return (
    <div
      ref={mergeRefs(ref, rootRef)}
      className={cn(styles.root, className)}
      data-open={openSide ?? undefined}
      data-dragging={dragging || undefined}
      style={rootStyle}
      onKeyDown={onKeyDown}
      {...props}
    >
      <SwipeActionsContext.Provider value={{ openSide, close }}>
        {leading != null ? (
          <div ref={leadingRef} className={styles.actions} data-side="leading" aria-hidden={openSide === 'leading' ? undefined : true}>
            <SwipeActionsSideContext.Provider value="leading">{leading}</SwipeActionsSideContext.Provider>
          </div>
        ) : null}
        {trailing != null ? (
          <div ref={trailingRef} className={styles.actions} data-side="trailing" aria-hidden={openSide === 'trailing' ? undefined : true}>
            <SwipeActionsSideContext.Provider value="trailing">{trailing}</SwipeActionsSideContext.Provider>
          </div>
        ) : null}
        <div
          ref={contentRef}
          className={styles.content}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {children}
        </div>
      </SwipeActionsContext.Provider>
    </div>
  );
});

const SwipeActionsAction = forwardRef<HTMLButtonElement, SwipeActionsActionProps>(function SwipeActionsAction(
  { intent = 'neutral', closeOnSelect = true, type, className, onClick, children, ...props },
  ref,
) {
  const context = useContext(SwipeActionsContext);
  const side = useContext(SwipeActionsSideContext);
  const open = side != null && context?.openSide === side;

  function handleClick(event: MouseEvent<HTMLButtonElement>): void {
    onClick?.(event);
    if (closeOnSelect && !event.defaultPrevented) context?.close();
  }

  return (
    <button ref={ref} type={type ?? 'button'} className={cn(styles.action, className)} data-intent={intent} tabIndex={open ? 0 : -1} onClick={handleClick} {...props}>
      {children}
    </button>
  );
});

export const SwipeActions = Object.assign(SwipeActionsRoot, { Action: SwipeActionsAction });
