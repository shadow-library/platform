/**
 * Defining types
 */
export interface BuildCheckTiming {
  /** Interval between routine checks, and the base of the failure backoff. */
  intervalMs: number;
  /** Shortest gap between two checks triggered by focus or visibility regain. */
  minGapMs: number;
  /** Ceiling of the exponential backoff after consecutive failed checks. */
  maxBackoffMs: number;
}

export interface BuildCheckState {
  lastAttemptAt: number;
  failures: number;
}

/**
 * Declaring the constants
 */
export const BUILD_ID_ENDPOINT = '/build-id';

export const DEFAULT_BUILD_CHECK_TIMING: BuildCheckTiming = { intervalMs: 5 * 60_000, minGapMs: 30_000, maxBackoffMs: 60 * 60_000 };

const MAX_BUILD_ID_LENGTH = 200;

/* Chrome, Firefox and Safari phrase a failed dynamic import differently; Vite adds its own for CSS preloads. */
const CHUNK_LOAD_FAILURE = /^(?:Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS)/;

/** The id a build stamps into both its client bundle and its server: the deploy's version when one is given, otherwise the build's start time. */
export function resolveBuildId(version: string | undefined, builtAt: number): string {
  const trimmed = version?.trim();
  return trimmed ? trimmed : `local-${builtAt.toString(36)}`;
}

/** The no-store JSON body a web app's build-id route answers with. */
export function buildIdResponse(buildId: string): Response {
  return Response.json({ buildId }, { headers: { 'cache-control': 'no-store' } });
}

export function readBuildId(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const buildId = (body as Record<string, unknown>)['buildId'];
  if (typeof buildId !== 'string') return null;
  const trimmed = buildId.trim();
  return trimmed && trimmed.length <= MAX_BUILD_ID_LENGTH ? trimmed : null;
}

/** Any difference counts, a rollback included: either way the tab is running code the server no longer serves. */
export function isDifferentBuild(loadedBuildId: string, servedBuildId: string | null): servedBuildId is string {
  return servedBuildId !== null && servedBuildId !== loadedBuildId;
}

export function retryDelay(failures: number, timing: BuildCheckTiming): number {
  if (failures <= 0) return timing.intervalMs;
  return Math.min(timing.intervalMs * 2 ** (failures - 1), timing.maxBackoffMs);
}

/** Milliseconds until the next routine check is due. */
export function nextCheckDelay(state: BuildCheckState, now: number, timing: BuildCheckTiming): number {
  return Math.max(0, state.lastAttemptAt + retryDelay(state.failures, timing) - now);
}

/** An urgent check (a chunk failed to load) skips the focus gap but never the failure backoff. */
export function canCheckNow(state: BuildCheckState, now: number, timing: BuildCheckTiming, urgent = false): boolean {
  const elapsed = now - state.lastAttemptAt;
  if (state.failures > 0) return elapsed >= retryDelay(state.failures, timing);
  return urgent || elapsed >= timing.minGapMs;
}

export function isChunkLoadError(reason: unknown): boolean {
  if (typeof reason !== 'object' || reason === null) return false;
  const { name, message } = reason as { name?: unknown; message?: unknown };
  if (name === 'ChunkLoadError') return true;
  return typeof message === 'string' && CHUNK_LOAD_FAILURE.test(message);
}
