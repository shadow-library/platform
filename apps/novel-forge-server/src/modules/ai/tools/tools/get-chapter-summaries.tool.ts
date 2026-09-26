import { and, between, eq } from 'drizzle-orm';
import { z } from 'zod';

import * as schema from '@server/database/schemas';

import { bridgedSummary, loadIsolationBridges } from '../../../finalize-review/isolation-bridge';
import { type RegisteredTool } from '../types';

const inputSchema = z
  .object({
    from: z.number().int().min(1),
    to: z.number().int().min(1),
  })
  .refine(i => i.to - i.from <= 20, { message: 'Chapter range must not exceed 20' });

const outputSchema = z.string();

export const getChapterSummariesTool: RegisteredTool = {
  allowedNodes: ['judge', 'validateWindow', 'chat-hub'],
  description: 'Retrieve chapter summaries for a range of chapters (max 20-chapter span).',
  handler: async (input: unknown, ctx): Promise<unknown> => {
    const parsed = inputSchema.parse(input);
    const rows = await ctx.db
      .select()
      .from(schema.chapters)
      .where(and(eq(schema.chapters.projectId, ctx.projectId), between(schema.chapters.number, parsed.from, parsed.to)));
    if (rows.length === 0) return 'No chapters in range.';
    const sorted = rows.sort((a, b) => a.number - b.number);
    const bridges = await loadIsolationBridges(
      ctx.db,
      ctx.projectId,
      sorted.map(ch => ({ chapter: ch.number, isolated: ch.isolated })),
    );
    const line = (ch: (typeof sorted)[number]): string => {
      const summary = bridgedSummary(ch, bridges.get(ch.number));
      if (ch.isolated) return `Ch ${ch.number} [unrestricted]: ${summary ?? '(walled off — no approved bridge)'}`;
      return `Ch ${ch.number}: ${summary ?? '(no summary)'}`;
    };
    return sorted.map(line).join('\n');
  },
  inputSchema,
  maxCallsPerRun: 5,
  name: 'get_chapter_summaries',
  outputSchema,
  tokensBudget: 8000,
};
