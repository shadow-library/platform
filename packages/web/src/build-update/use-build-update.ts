import { useCallback, useEffect, useState } from 'react';

import {
  BUILD_ID_ENDPOINT,
  type BuildCheckState,
  type BuildCheckTiming,
  canCheckNow,
  DEFAULT_BUILD_CHECK_TIMING,
  isChunkLoadError,
  isDifferentBuild,
  nextCheckDelay,
  readBuildId,
} from './build-update';

export interface UseBuildUpdateOptions extends Partial<BuildCheckTiming> {
  /** The id stamped into this client bundle at build time. */
  buildId: string;
  /** Same-origin route answering `{ buildId }` for the running server. @default '/build-id' */
  endpoint?: string;
  /** Abort a check that has not answered within this many milliseconds. @default 10000 */
  timeoutMs?: number;
  /** @default true */
  enabled?: boolean;
}

export interface UseBuildUpdate {
  /** The server runs a different build than this tab loaded, and the author has not dismissed that build. */
  updateAvailable: boolean;
  reload: () => void;
  dismiss: () => void;
}

async function fetchServedBuildId(endpoint: string, signal: AbortSignal): Promise<string | null> {
  try {
    const response = await fetch(endpoint, { cache: 'no-store', credentials: 'omit', headers: { accept: 'application/json' }, signal });
    if (!response.ok) return null;
    return readBuildId(await response.json());
  } catch {
    return null;
  }
}

/** Never reloads on the author's behalf. Runs only in an effect, so server render and hydration both see `updateAvailable: false`. */
export function useBuildUpdate(options: UseBuildUpdateOptions): UseBuildUpdate {
  const { buildId, endpoint = BUILD_ID_ENDPOINT, timeoutMs = 10_000, enabled = true } = options;
  const intervalMs = options.intervalMs ?? DEFAULT_BUILD_CHECK_TIMING.intervalMs;
  const minGapMs = options.minGapMs ?? DEFAULT_BUILD_CHECK_TIMING.minGapMs;
  const maxBackoffMs = options.maxBackoffMs ?? DEFAULT_BUILD_CHECK_TIMING.maxBackoffMs;
  const [servedBuildId, setServedBuildId] = useState<string | null>(null);
  const [dismissedBuildId, setDismissedBuildId] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const timing: BuildCheckTiming = { intervalMs, minGapMs, maxBackoffMs };
    let state: BuildCheckState = { lastAttemptAt: Date.now(), failures: 0 };
    let inFlight: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const schedule = (): void => {
      clearTimeout(timer);
      timer = setTimeout(() => void check(false), nextCheckDelay(state, Date.now(), timing));
    };

    // A hidden or offline tab lets its timer lapse; the visibilitychange or online event restarts it.
    const check = async (urgent: boolean): Promise<void> => {
      if (disposed || inFlight) return;
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      if (!canCheckNow(state, Date.now(), timing, urgent)) {
        schedule();
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      inFlight = controller;
      const startedAt = Date.now();
      const served = await fetchServedBuildId(endpoint, controller.signal);
      clearTimeout(timeout);
      inFlight = null;
      if (disposed) return;

      state = { lastAttemptAt: startedAt, failures: served === null ? state.failures + 1 : 0 };
      if (isDifferentBuild(buildId, served)) setServedBuildId(served);
      schedule();
    };

    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void check(false);
    };
    const onFocus = (): void => void check(false);
    const onPreloadError = (): void => void check(true);
    const onRejection = (event: PromiseRejectionEvent): void => {
      if (isChunkLoadError(event.reason)) void check(true);
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    window.addEventListener('vite:preloadError', onPreloadError);
    window.addEventListener('unhandledrejection', onRejection);
    schedule();

    return () => {
      disposed = true;
      clearTimeout(timer);
      inFlight?.abort();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
      window.removeEventListener('vite:preloadError', onPreloadError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [buildId, endpoint, timeoutMs, enabled, intervalMs, minGapMs, maxBackoffMs]);

  const reload = useCallback(() => window.location.reload(), []);
  const dismiss = useCallback(() => setDismissedBuildId(servedBuildId), [servedBuildId]);
  return { updateAvailable: servedBuildId !== null && servedBuildId !== dismissedBuildId, reload, dismiss };
}
