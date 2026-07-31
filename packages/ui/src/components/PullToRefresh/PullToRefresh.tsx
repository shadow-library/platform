/**
 * Importing npm packages
 */
import { type CSSProperties, forwardRef, type PointerEvent, useCallback, useRef, useState } from 'react';

/**
 * Importing user defined packages
 */
import { cn, mergeRefs } from '@/lib';

import styles from './PullToRefresh.module.css';
import { type PullToRefreshProps, type PullToRefreshStatus } from './PullToRefresh.types';

/**
 * Declaring the constants
 */
const RESISTANCE = 0.5; // finger travel is halved so the pull feels elastic
const DIRECTION_SLOP = 8; // px of travel before the gesture commits to pull vs scroll

interface DragState {
  active: boolean;
  pulling: boolean;
  pointerId: number;
  startY: number;
  distance: number;
}

/**
 * The list-refresh gesture: pulling down from the top of the scroll container reveals a progress
 * spinner and, past the threshold, arms a refresh that runs on release. The root is the scroll
 * container; content translates with the (resisted) pull. The gesture is never the only path —
 * a visually-hidden-until-focused button (skip-link treatment) gives keyboard and screen-reader
 * users the same refresh, and a live region announces the refreshing state.
 */
export const PullToRefresh = forwardRef<HTMLDivElement, PullToRefreshProps>(function PullToRefresh(
  { onRefresh, threshold = 64, disabled = false, refreshLabel = 'Refresh', className, style, children, ...props },
  ref,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState>({ active: false, pulling: false, pointerId: -1, startY: 0, distance: 0 });
  const [distance, setDistance] = useState(0);
  const [status, setStatus] = useState<PullToRefreshStatus>('idle');

  const runRefresh = useCallback(async (): Promise<void> => {
    setStatus('refreshing');
    setDistance(threshold);
    try {
      await onRefresh();
    } finally {
      setStatus('idle');
      setDistance(0);
    }
  }, [onRefresh, threshold]);

  function onPointerDown(event: PointerEvent<HTMLDivElement>): void {
    if (disabled || status === 'refreshing') return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const node = scrollRef.current;
    if (!node || node.scrollTop > 0) return;
    drag.current = { active: true, pulling: false, pointerId: event.pointerId, startY: event.clientY, distance: 0 };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>): void {
    const state = drag.current;
    if (!state.active) return;
    const dy = event.clientY - state.startY;

    if (!state.pulling) {
      // The gesture only becomes a pull with clear downward travel while still at the top;
      // upward travel is a normal scroll and releases the gesture untouched.
      if (dy < -DIRECTION_SLOP) {
        state.active = false;
        return;
      }
      if (dy < DIRECTION_SLOP) return;
      const node = scrollRef.current;
      if (!node || node.scrollTop > 0) {
        state.active = false;
        return;
      }
      state.pulling = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    state.distance = Math.max(0, dy - DIRECTION_SLOP) * RESISTANCE;
    setDistance(state.distance);
    setStatus(state.distance >= threshold ? 'armed' : 'pulling');
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>): void {
    const state = drag.current;
    if (!state.active) return;
    state.active = false;
    if (!state.pulling) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (state.distance >= threshold) {
      void runRefresh();
    } else {
      setStatus('idle');
      setDistance(0);
    }
  }

  const rootStyle = { '--ptr-distance': `${distance}px`, '--ptr-progress': String(Math.min(1, distance / threshold)), ...style } as CSSProperties;

  return (
    <div
      ref={mergeRefs(ref, scrollRef)}
      className={cn(styles.root, className)}
      data-status={status}
      style={rootStyle}
      {...props}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <button type="button" className={styles.refreshAffordance} disabled={disabled || status === 'refreshing'} onClick={() => void runRefresh()}>
        {refreshLabel}
      </button>
      <div className={styles.indicator} aria-hidden="true">
        <span className={styles.spinner} />
      </div>
      <div className={styles.status} role="status">
        {status === 'refreshing' ? 'Refreshing' : null}
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  );
});
