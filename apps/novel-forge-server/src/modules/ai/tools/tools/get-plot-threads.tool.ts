/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { and, eq } from 'drizzle-orm';
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

const inputSchema = z.object({
  status: z.enum(['closed', 'open']).optional(),
});

const outputSchema = z.string();

export const getPlotThreadsTool: RegisteredTool = {
  allowedNodes: ['judge', 'validateWindow', 'chat-hub'],
  description: 'Retrieve plot threads, optionally filtered by status (open or closed).',
  handler: async (input: unknown, ctx): Promise<unknown> => {
    const parsed = inputSchema.parse(input);
    const where = parsed.status
      ? and(eq(schema.plotThreads.projectId, ctx.projectId), eq(schema.plotThreads.status, parsed.status))
      : eq(schema.plotThreads.projectId, ctx.projectId);
    const threads = await ctx.db.select().from(schema.plotThreads).where(where);
    if (threads.length === 0) return 'No plot threads found.';
    return threads.map(t => `${t.threadKey} (${t.status}, ch ${t.openedChapter ?? '?'}–${t.closedChapter ?? '?'}): ${t.summary ?? ''}`).join('\n');
  },
  inputSchema,
  maxCallsPerRun: 5,
  name: 'get_plot_threads',
  outputSchema,
  tokensBudget: 4000,
};
