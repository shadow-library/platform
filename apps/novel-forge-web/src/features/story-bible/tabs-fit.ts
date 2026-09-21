import { useCallback, useRef, useState } from 'react';

import { tabsFit } from '@/lib/bible-topics';

export interface TabsFit {
  observeContainer: (node: HTMLElement | null) => void;
  measureList: (node: HTMLElement | null) => void;
  fits: boolean;
}

function contentWidth(list: HTMLElement): number {
  const gap = Number.parseFloat(getComputedStyle(list).columnGap) || 0;
  const tabs = Array.from(list.children);
  return tabs.reduce((width, tab) => width + tab.getBoundingClientRect().width, 0) + gap * Math.max(0, tabs.length - 1);
}

/**
 * Measures the tab row's natural width against the room it has. Give the tab list `key={key}` so it remounts, and is
 * re-measured, whenever its tabs or counts change; while it is swapped for a select the last measurement stands.
 */
export function useTabsFit(key: string): TabsFit {
  const [available, setAvailable] = useState(0);
  const [needed, setNeeded] = useState<number | undefined>();
  const [measuredKey, setMeasuredKey] = useState(key);
  const observer = useRef<ResizeObserver | null>(null);

  if (measuredKey !== key) {
    setMeasuredKey(key);
    setNeeded(undefined);
  }

  const observeContainer = useCallback((node: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node) return;
    setAvailable(node.clientWidth);
    observer.current = new ResizeObserver(entries => setAvailable(entries[0]?.contentRect.width ?? 0));
    observer.current.observe(node);
  }, []);

  const measureList = useCallback((node: HTMLElement | null) => {
    if (node) setNeeded(contentWidth(node));
  }, []);

  return { observeContainer, measureList, fits: tabsFit(needed, available) };
}
