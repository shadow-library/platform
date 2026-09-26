import { createHash } from 'node:crypto';

import { type WriterDisclosurePolicy } from '../../bible/fact/writer-disclosure-policy';

/** A stand-in for the Story Bible content a writer attempt saw, so a snapshot row can be correlated across revisions without re-rendering a pack that must never change. */
export function bibleHashOf(rendered: string | null | undefined): string | null {
  return rendered ? createHash('sha256').update(rendered).digest('hex') : null;
}

/**
 * What the writer attempt was kept from and why: counts of passages the disclosure policy withheld for secrecy
 * (never the withheld text itself — see `WriterDisclosurePolicy.withheld`) plus what the context pack cut for budget.
 */
export function keptBackOf(disclosure: WriterDisclosurePolicy, omitted: unknown): Record<string, unknown> {
  return { withheldForSecrecy: Object.fromEntries(disclosure.withheld), omittedForBudget: omitted ?? null };
}
