import { z } from 'zod';

import { describeUnlockTerm, isUnlockCondition } from '@server/common';

import { type RegisteredTool } from '../types';

const inputSchema = z.object({
  keys: z.array(z.string().min(1)).min(1).max(20),
});

const outputSchema = z.string();

export const getCanonFactsTool: RegisteredTool = {
  allowedNodes: ['chat-hub'],
  description: 'Retrieve canon facts and secrets by key: the truth, when the reader may learn it, the cover note for the writer, its give-away terms and allowed clues.',
  handler: async (input: unknown, ctx): Promise<unknown> => {
    const parsed = inputSchema.parse(input);
    const facts = await ctx.db.query.canonFacts.findMany({
      where: (fact, { and, eq, inArray }) => and(eq(fact.projectId, ctx.projectId), inArray(fact.factKey, parsed.keys)),
      orderBy: (fact, { asc }) => asc(fact.factKey),
    });
    const found = new Set(facts.map(fact => fact.factKey));
    const missing = parsed.keys.filter(key => !found.has(key));
    const blocks = facts.map(fact => {
      const unlock = isUnlockCondition(fact.unlock) ? fact.unlock.all.map(describeUnlockTerm).join(' and ') : null;
      return [
        `**${fact.factKey}**: ${fact.text}`,
        fact.disclosedInChapter !== null ? `Reader knows since ch ${fact.disclosedInChapter}` : `Unlocks: ${unlock ?? 'no condition set'}`,
        fact.plannedChapter !== null ? `Planned reveal: ch ${fact.plannedChapter}` : null,
        fact.writerNote ? `Cover note for the writer: ${fact.writerNote}` : null,
        (fact.terms ?? []).length > 0 ? `Give-away terms: ${(fact.terms ?? []).join(' | ')}` : null,
        (fact.allowedClues ?? []).length > 0 ? `Allowed clues: ${(fact.allowedClues ?? []).join(' | ')}` : null,
      ]
        .filter(Boolean)
        .join('\n');
    });
    if (missing.length > 0) blocks.push(`Not found: ${missing.join(', ')}`);
    return blocks.join('\n\n');
  },
  inputSchema,
  maxCallsPerRun: 4,
  name: 'get_canon_facts',
  outputSchema,
  tokensBudget: 4_000,
};
