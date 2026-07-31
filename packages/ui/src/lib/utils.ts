/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(part => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Parse a string (e.g. a URL search param) into a positive integer, or `null` when it is absent, not a
 * finite number, or non-positive. Set `allowZero` to accept `0` (for a `skip` offset).
 */
export function toPositiveInt(value?: string | null, allowZero = false): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const int = Math.floor(parsed);
  return int > 0 || (allowZero && int === 0) ? int : null;
}
