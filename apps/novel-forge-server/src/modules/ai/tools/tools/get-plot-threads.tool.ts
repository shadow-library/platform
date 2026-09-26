import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import * as schema from '@server/database/schemas';

import { payoffLabel } from '../../context/novel-chat-context';
import { type RegisteredTool } from '../types';

const inputSchema = z.object({
  status: z.enum(['closed', 'open', 'dropped']).optional(),
});

const outputSchema = z.string();

export const getPlotThreadsTool: RegisteredTool = {
  allowedNodes: ['judge', 'validateWindow', 'chat-hub'],
  description: 'Retrieve plot threads (promises), optionally filtered by status (open, closed, or dropped).',
  handler: async (input: unknown, ctx): Promise<unknown> => {
    const parsed = inputSchema.parse(input);
    const where = parsed.status
      ? and(eq(schema.plotThreads.projectId, ctx.projectId), eq(schema.plotThreads.status, parsed.status))
      : eq(schema.plotThreads.projectId, ctx.projectId);
    const threads = await ctx.db.select().from(schema.plotThreads).where(where);
    if (threads.length === 0) return 'No plot threads found.';
    return threads
      .map(t => {
        const dormant = t.intentionallyOpen ? ', dormant on purpose' : '';
        return `${t.threadKey} (${t.status}, ch ${t.openedChapter ?? '?'}–${t.closedChapter ?? '?'}, pays off: ${payoffLabel(t.payoffWindow, t.payoffMilestoneKey, t.payoffVolumeKey)}${dormant}): ${t.summary ?? ''}`;
      })
      .join('\n');
  },
  inputSchema,
  maxCallsPerRun: 5,
  name: 'get_plot_threads',
  outputSchema,
  tokensBudget: 4000,
};
