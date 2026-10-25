import { selectorName } from '@/features/shared/naming';

/** synapse-server's `KEY_PATTERN`, which every provider, model and alias key and every selector name must match. */
export const CATALOG_KEY_PATTERN = /^[A-Za-z0-9][\w.:/@-]*$/;

export const CATALOG_KEY_HINT = 'Start with a letter or digit, then use only letters, digits and . _ - : / @';

export function resolveSelectorKey(input: string, knownKeys: readonly string[]): string {
  const typed = input.trim();
  const folded = typed.toLowerCase();
  return knownKeys.find(key => key === typed) ?? knownKeys.find(key => key.toLowerCase() === folded || selectorName(key).toLowerCase() === folded) ?? typed;
}
