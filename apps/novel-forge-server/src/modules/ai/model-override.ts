import { AppErrorCode } from '@server/classes';

const OPENROUTER_HOST = /(^|\.)openrouter\.ai$/;

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** The override re-points every paid route at one model id, so it may only run against a local model server — never OpenRouter itself. */
export function assertModelOverrideTarget(override: string | undefined, apiUrl: string | undefined): void {
  if (!override) return;
  const host = apiUrl ? hostOf(apiUrl) : null;
  if (host === null || OPENROUTER_HOST.test(host)) throw AppErrorCode.AI_017.create({ url: apiUrl ?? '(unset)' });
}
