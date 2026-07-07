/**
 * Importing user defined packages
 */
import { type BannerConfig, type BannerIntent } from './Banner.types';

/**
 * Declaring the constants
 */
type Listener = () => void;

const SEVERITY: Record<BannerIntent, number> = { danger: 3, warning: 2, info: 1, success: 0 };

let registry: BannerConfig[] = [];
const dismissed = new Set<string>();
const listeners = new Set<Listener>();
let current: BannerConfig | null = null;

/** Re-raise key — a banner dismissed under one payload returns when its message changes. */
function keyOf(config: BannerConfig): string {
  return `${config.id}:${String(config.message)}`;
}

function severity(config: BannerConfig): number {
  return SEVERITY[config.intent ?? 'info'];
}

function computeCurrent(): BannerConfig | null {
  let best: BannerConfig | null = null;
  let bestRank = -1;
  registry.forEach((config, index) => {
    if (config.when === false || dismissed.has(keyOf(config))) return;
    // Higher severity wins; ties break by recency (later registration index).
    const rank = severity(config) * 1000 + index;
    if (rank > bestRank) {
      best = config;
      bestRank = rank;
    }
  });
  return best;
}

function emit(): void {
  const next = computeCurrent();
  // computeCurrent returns the stored config object; a stable reference keeps the
  // useSyncExternalStore snapshot stable until the visible banner actually changes.
  if (Object.is(next, current)) return;
  current = next;
  for (const listener of listeners) listener();
}

export const bannerStore = {
  register(config: BannerConfig): void {
    const existing = registry.findIndex(entry => entry.id === config.id);
    registry = existing >= 0 ? registry.map((entry, i) => (i === existing ? config : entry)) : [...registry, config];
    emit();
  },
  unregister(id: string): void {
    registry = registry.filter(entry => entry.id !== id);
    emit();
  },
  dismiss(id: string): void {
    const config = registry.find(entry => entry.id === id);
    if (config) dismissed.add(keyOf(config));
    emit();
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): BannerConfig | null {
    return current;
  },
  /** Test/reset helper — clears the registry and dismissal memory. */
  reset(): void {
    registry = [];
    dismissed.clear();
    current = null;
  },
};
