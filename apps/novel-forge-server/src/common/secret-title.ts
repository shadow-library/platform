import { humaniseSlug } from './bible-doc-title';

/** How a secret is named wherever its truth must not show: its own label when it has one, else its key read as words. */
export function secretTitle(fact: { factKey: string; label?: string | null }): string {
  return fact.label?.trim() || humaniseSlug(fact.factKey);
}
