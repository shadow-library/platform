/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { z } from 'zod';

/**
 * Importing user defined packages
 */
import { type RegisteredTool } from '../types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const MAX_K = 8;
const DEFAULT_K = 5;

const inputSchema = z.object({
  k: z.number().int().min(1).max(MAX_K).optional(),
  query: z.string(),
});

const outputSchema = z.string();

export const searchProseTool: RegisteredTool = {
  allowedNodes: ['judge', 'review'],
  description: 'Search the prose index for relevant story passages by query.',
  handler: async (input: unknown, ctx): Promise<unknown> => {
    const parsed = inputSchema.parse(input);
    const k = Math.min(parsed.k ?? DEFAULT_K, MAX_K);
    const hits = await ctx.retrieval.searchProse(ctx.projectId, parsed.query, k);
    if (hits.length === 0) return 'No prose found.';
    return hits.map(h => `[Ch ${h.metadata.chapter ?? '?'}] ${h.text}`).join('\n---\n');
  },
  inputSchema,
  maxCallsPerRun: 8,
  name: 'search_prose',
  outputSchema,
  tokensBudget: 6000,
};
