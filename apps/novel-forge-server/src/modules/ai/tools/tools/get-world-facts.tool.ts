import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import * as schema from '@server/database/schemas';

import { type RegisteredTool } from '../types';

const inputSchema = z.object({
  category: z.string().optional(),
});

const outputSchema = z.string();

export const getWorldFactsTool: RegisteredTool = {
  allowedNodes: ['judge', 'validateWindow', 'chat-hub'],
  description: 'Retrieve world facts, optionally filtered by category.',
  handler: async (input: unknown, ctx): Promise<unknown> => {
    const parsed = inputSchema.parse(input);
    const where = parsed.category
      ? and(eq(schema.worldFacts.projectId, ctx.projectId), eq(schema.worldFacts.category, parsed.category))
      : eq(schema.worldFacts.projectId, ctx.projectId);
    const facts = await ctx.db.select().from(schema.worldFacts).where(where);
    if (facts.length === 0) return 'No world facts found.';

    const byCategory = new Map<string, { key: string; value: string }[]>();
    for (const fact of facts) {
      const existing = byCategory.get(fact.category);
      if (existing) {
        existing.push({ key: fact.key, value: fact.value });
      } else {
        byCategory.set(fact.category, [{ key: fact.key, value: fact.value }]);
      }
    }

    const lines: string[] = [];
    for (const [category, items] of byCategory) {
      lines.push(`${category}:`);
      for (const item of items) {
        lines.push(`- ${item.key}: ${item.value}`);
      }
    }
    return lines.join('\n');
  },
  inputSchema,
  maxCallsPerRun: 5,
  name: 'get_world_facts',
  outputSchema,
  tokensBudget: 4000,
};
