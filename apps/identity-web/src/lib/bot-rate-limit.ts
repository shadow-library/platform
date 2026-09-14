export const MIN_RATE_LIMIT = 1;
export const MAX_RATE_LIMIT = 600;

export function rateLimitError(value: number | null): string | undefined {
  if (value === null) return 'Enter a rate limit.';
  if (!Number.isInteger(value)) return 'Enter a whole number of requests.';
  if (value < MIN_RATE_LIMIT || value > MAX_RATE_LIMIT) return `Enter a rate limit between ${MIN_RATE_LIMIT} and ${MAX_RATE_LIMIT}.`;
  return undefined;
}

export function isValidRateLimit(value: number | null): value is number {
  return rateLimitError(value) === undefined;
}
