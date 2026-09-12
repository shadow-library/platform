const NAMING_WINDOW_MS = 2 * 60 * 1000;

export interface SeedNamingInfo {
  name?: string | null;
  sparkExcerpt?: string | null;
  createdAt: string;
}

export function firstTitle(candidates: readonly (string | null | undefined)[], fallback: string): string {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return fallback;
}

export function isBeingNamed(seed: SeedNamingInfo, now: Date): boolean {
  if (seed.name?.trim()) return false;
  if (!seed.sparkExcerpt?.trim()) return false;
  return now.getTime() - new Date(seed.createdAt).getTime() < NAMING_WINDOW_MS;
}

export function anySeedBeingNamed(seeds: readonly SeedNamingInfo[], now: Date): boolean {
  return seeds.some(seed => isBeingNamed(seed, now));
}
