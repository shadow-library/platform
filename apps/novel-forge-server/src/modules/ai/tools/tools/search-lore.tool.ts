import { z } from 'zod';

import { type RegisteredTool } from '../types';

// Defence in depth: `kinds` is model-chosen and reaches a SQL filter, so constrain it to an identifier
// shape here as well — the values are also bound as parameters in RetrievalService.searchLore.
const inputSchema = z.object({
  kinds: z.array(z.string().regex(/^[a-z0-9_]{1,64}$/i)).optional(),
  query: z.string(),
});

const outputSchema = z.string();

export const searchLoreTool: RegisteredTool = {
  allowedNodes: ['judge', 'review', 'validateWindow', 'chat-hub'],
  description: 'Search the lore knowledge base for relevant information about characters, factions, locations, or world rules.',
  handler: async (input: unknown, ctx): Promise<unknown> => {
    const parsed = inputSchema.parse(input);
    const hits = await ctx.retrieval.searchLore(ctx.projectId, parsed.query, 6, parsed.kinds ? { kinds: parsed.kinds } : {});
    if (hits.length === 0) return 'No lore found.';
    return hits.map(h => `${h.metadata.kind ?? 'unknown'}:${h.metadata.refKey ?? ''} — ${h.text}`).join('\n');
  },
  inputSchema,
  maxCallsPerRun: 10,
  name: 'search_lore',
  outputSchema,
  tokensBudget: 4000,
};
