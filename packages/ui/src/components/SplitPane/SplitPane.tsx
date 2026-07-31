/**
 * Importing npm packages
 */
import { Children, isValidElement, type KeyboardEvent, type PointerEvent, type ReactElement, type ReactNode, useEffect, useRef, useState } from 'react';

/**
 * Importing user defined packages
 */
import { useIsomorphicLayoutEffect } from '@/hooks';
import { cn } from '@/lib';

import styles from './SplitPane.module.css';
import { type SplitPaneHandleProps, type SplitPanePaneProps, type SplitPaneProps, type SplitSize } from './SplitPane.types';

/**
 * Declaring the constants
 */
const COLLAPSE_SLOP = 40; // drag this many px past a collapsible pane's min to snap it collapsed
const KEY_STEP = 16; // px moved per arrow key

/** Marker component — the container reads its props and renders the pane content. */
export function SplitPanePane(_props: SplitPanePaneProps): null {
  return null;
}

/** Marker component — the container reads its aria-label and renders the actual handle. */
export function SplitPaneHandle(_props: SplitPaneHandleProps): null {
  return null;
}

function isPane(node: ReactNode): node is ReactElement<SplitPanePaneProps> {
  return isValidElement(node) && node.type === SplitPanePane;
}
function isHandle(node: ReactNode): node is ReactElement<SplitPaneHandleProps> {
  return isValidElement(node) && node.type === SplitPaneHandle;
}

/** Resolve a px/percent size against the container length; `undefined` falls back. */
function resolveSize(size: SplitSize | undefined, containerLen: number, fallback: number): number {
  if (size === undefined) return fallback;
  if (typeof size === 'number') return size;
  return (Number.parseFloat(size) / 100) * containerLen;
}

/**
 * Two regions, one negotiable boundary. Where App Shell and Sidebar fix the layout, the Split Pane
 * hands the boundary to the user — resize, collapse, and remember — and owns nothing else; pane content
 * is opaque. The handle follows the WAI-ARIA window-splitter pattern (role=separator with valuenow/
 * min/max) and is a real tab stop: every outcome (resize, collapse, reset) is reachable from the
 * keyboard. Nest by placing a Split Pane inside a Pane; each container owns its own handle and key.
 */
function SplitPaneRoot({ direction = 'horizontal', autoSaveId, onResize, children, className }: SplitPaneProps) {
  const nodes = Children.toArray(children);
  const panes = nodes.filter(isPane);
  const handle = nodes.find(isHandle);
  const first = panes[0]?.props;
  const second = panes[1]?.props;

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerLen, setContainerLen] = useState(0);
  const [size, setSize] = useState<number | null>(null); // px of the first pane
  const [collapsed, setCollapsed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const lastSize = useRef(0);
  const storageKey = autoSaveId ? `sh-splitpane:${autoSaveId}` : null;

  // Measure the container along the split axis.
  useIsomorphicLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const measure = () => setContainerLen(direction === 'horizontal' ? node.clientWidth : node.clientHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [direction]);

  // Initialize (from storage or defaultSize) once the container is measured.
  // one-time init guarded by `size === null`; only the container measurement should retrigger it
  useEffect(() => {
    if (containerLen === 0 || size !== null) return;
    let fraction: number | null = null;
    if (storageKey) {
      const saved = globalThis.localStorage?.getItem(storageKey);
      if (saved) fraction = Number.parseFloat(saved);
    }
    const initial = fraction != null && Number.isFinite(fraction) ? fraction * containerLen : resolveSize(first?.defaultSize, containerLen, containerLen * 0.3);
    setSize(clamp(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time init guarded by `size === null`; only the container measurement should retrigger it
  }, [containerLen]);

  function bounds(): { min: number; max: number } {
    const min = resolveSize(first?.minSize, containerLen, 120);
    const secondMin = resolveSize(second?.minSize, containerLen, 120);
    const max = Math.min(resolveSize(first?.maxSize, containerLen, containerLen - secondMin), containerLen - secondMin);
    return { min, max };
  }

  function clamp(value: number): number {
    const { min, max } = bounds();
    return Math.max(min, Math.min(max, value));
  }

  function commit(next: number): void {
    setSize(next);
    if (storageKey && containerLen > 0) globalThis.localStorage?.setItem(storageKey, String(next / containerLen));
    if (containerLen > 0) onResize?.(Math.round((next / containerLen) * 100));
  }

  const drag = useRef({ startPos: 0, startSize: 0 });

  function onPointerDown(event: PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;
    drag.current = { startPos: direction === 'horizontal' ? event.clientX : event.clientY, startSize: collapsed ? 0 : (size ?? 0) };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>): void {
    if (!dragging) return;
    const pos = direction === 'horizontal' ? event.clientX : event.clientY;
    const raw = drag.current.startSize + (pos - drag.current.startPos);
    const { min } = bounds();
    if (first?.collapsible && raw < min - COLLAPSE_SLOP) {
      if (!collapsed) {
        lastSize.current = size ?? min;
        setCollapsed(true);
      }
      return;
    }
    if (collapsed) setCollapsed(false);
    setSize(clamp(raw));
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>): void {
    if (!dragging) return;
    setDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (!collapsed && size != null) commit(size);
  }

  function onDoubleClick(): void {
    setCollapsed(false);
    commit(clamp(resolveSize(first?.defaultSize, containerLen, containerLen * 0.3)));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const decrease = direction === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
    const increase = direction === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
    const { min, max } = bounds();
    if (event.key === decrease || event.key === increase) {
      event.preventDefault();
      if (collapsed) setCollapsed(false);
      const base = collapsed ? 0 : (size ?? min);
      commit(clamp(base + (event.key === increase ? KEY_STEP : -KEY_STEP)));
    } else if (event.key === 'Home') {
      event.preventDefault();
      commit(min);
    } else if (event.key === 'End') {
      event.preventDefault();
      commit(max);
    } else if (event.key === 'Enter' && first?.collapsible) {
      event.preventDefault();
      toggleCollapse();
    }
  }

  function toggleCollapse(): void {
    if (collapsed) {
      setCollapsed(false);
      commit(clamp(lastSize.current || resolveSize(first?.defaultSize, containerLen, containerLen * 0.3)));
    } else {
      lastSize.current = size ?? 0;
      setCollapsed(true);
    }
  }

  const { min, max } = bounds();
  const effectiveSize = collapsed ? 0 : (size ?? 0);
  const valueNow = containerLen > 0 ? Math.round((effectiveSize / containerLen) * 100) : 0;
  const handleLabel = handle?.props['aria-label'] ?? 'Resize panes';

  return (
    <div ref={containerRef} className={cn(styles.container, className)} data-direction={direction} data-dragging={dragging || undefined}>
      <div className={styles.pane} style={{ flexBasis: effectiveSize, display: collapsed ? 'none' : undefined }} hidden={collapsed}>
        {first?.children}
      </div>

      {collapsed ? (
        <button type="button" className={styles.rail} onClick={toggleCollapse}>
          {first?.collapseLabel ?? 'panel'}
        </button>
      ) : null}

      {/* a focusable window-splitter is role=separator with valuenow, not an <hr> */}
      <div
        className={styles.handle}
        role="separator"
        tabIndex={0}
        aria-label={handleLabel}
        aria-orientation={direction === 'horizontal' ? 'vertical' : 'horizontal'}
        aria-valuenow={valueNow}
        aria-valuemin={containerLen > 0 ? Math.round((min / containerLen) * 100) : 0}
        aria-valuemax={containerLen > 0 ? Math.round((max / containerLen) * 100) : 100}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
      >
        <span className={styles.handleLine} aria-hidden="true" />
      </div>

      <div className={styles.pane} style={{ flex: '1 1 0' }}>
        {second?.children}
      </div>
    </div>
  );
}

export const SplitPane = Object.assign(SplitPaneRoot, { Pane: SplitPanePane, Handle: SplitPaneHandle });
