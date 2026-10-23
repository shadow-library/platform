import { type ClassValue, clsx } from 'clsx';

/**
 * Composes conditional class names. With CSS Modules there are no utility-class conflicts to
 * de-duplicate, so this is a thin, dependency-light wrapper over clsx that components use to
 * merge their scoped module classes with a caller-supplied `className`.
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
