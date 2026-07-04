/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { and, between, eq } from 'drizzle-orm';
import { z } from 'zod';

/**
 * Importing user defined packages
 */
import * as schema from '@server/database/schemas';

import { type RegisteredTool } from '../types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const inputSchema = z
  .object({
    from: z.number().int().min(1),
    to: z.number().int().min(1),
  })
  .refine(i => i.to - i.from <= 20, { message: 'Chapter range must not exceed 20' });

const outputSchema = z.string();

export const getChapterSummariesTool: RegisteredTool = {
  allowedNodes: ['judge', 'validateWindow'],
  description: 'Retrieve chapter summaries for a range of chapters (max 20-chapter span).',
  handler: async (input: unknown, ctx): Promise<unknown> => {
    const parsed = inputSchema.parse(input);
    const rows = await ctx.db
      .select()
      .from(schema.chapters)
      .where(and(eq(schema.chapters.projectId, ctx.projectId), between(schema.chapters.number, parsed.from, parsed.to)));
    if (rows.length === 0) return 'No chapters in range.';
    const sorted = rows.sort((a, b) => a.number - b.number);
    return sorted.map(ch => `Ch ${ch.number}: ${ch.summary ?? '(no summary)'}`).join('\n');
  },
  inputSchema,
  maxCallsPerRun: 5,
  name: 'get_chapter_summaries',
  outputSchema,
  tokensBudget: 8000,
};
