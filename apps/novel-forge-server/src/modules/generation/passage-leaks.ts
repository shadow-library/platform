import { and, eq } from 'drizzle-orm';

import { type Generation, type PrimaryTransaction, schema } from '@server/database';

import { loadWriterDisclosurePolicy } from '../bible/fact/writer-disclosure-policy';

export interface PassageChange {
  passage: string;
  replacement: string;
}

/** Like a revise: a rewrite that brings in a locked secret its own passage did not already give away holds the draft as a contradiction, judged by the policy as it stands now. */
export async function holdNewLeaks(tx: PrimaryTransaction, draft: Generation.Draft, changes: readonly PassageChange[]): Promise<Generation.Draft> {
  const disclosure = await loadWriterDisclosurePolicy(tx, draft.projectId, draft.chapter);
  const givesNothingAway = (change: PassageChange): boolean => {
    const before = new Set(disclosure.leakLines(change.passage));
    return disclosure.leakLines(change.replacement).every(line => before.has(line));
  };
  if (changes.every(givesNothingAway)) return draft;
  const [held] = await tx
    .update(schema.drafts)
    .set({ reviewStatus: 'contradiction' })
    .where(and(eq(schema.drafts.id, draft.id), eq(schema.drafts.revision, draft.revision)))
    .returning();
  return held ?? draft;
}
