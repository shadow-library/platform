/** The reader promise's closed vocabularies. They live here because the prompts that offer them and the Blueprint that reads them both need them. */

export const PROMISE_DRIVERS = ['mystery', 'progression', 'romance', 'slice_of_life', 'war_adventure', 'political_intrigue', 'found_family'] as const;
export const PROMISE_LENGTHS = ['short', 'medium', 'long'] as const;
export const PROMISE_DRIVERS_MAX = 2;

export type PromiseDriver = (typeof PROMISE_DRIVERS)[number];
export type PromiseLength = (typeof PROMISE_LENGTHS)[number];

export const PROMISE_DRIVER_LABELS: Record<PromiseDriver, string> = {
  mystery: 'Mystery',
  progression: 'Progression',
  romance: 'Romance',
  slice_of_life: 'Slice of life',
  war_adventure: 'War and adventure',
  political_intrigue: 'Political intrigue',
  found_family: 'Found family',
};

export const PROMISE_LENGTH_LABELS: Record<PromiseLength, string> = {
  short: '~200 chapters',
  medium: '~800 chapters',
  long: '2,000+ chapters',
};

export function isPromiseDriver(value: unknown): value is PromiseDriver {
  return typeof value === 'string' && PROMISE_DRIVERS.includes(value as PromiseDriver);
}

export function isPromiseLength(value: unknown): value is PromiseLength {
  return typeof value === 'string' && PROMISE_LENGTHS.includes(value as PromiseLength);
}
