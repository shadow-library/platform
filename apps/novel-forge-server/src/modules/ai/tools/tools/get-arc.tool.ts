import { z } from 'zod';

import { type RegisteredTool } from '../types';

const inputSchema = z.object({
  arcKey: z.string(),
});

const outputSchema = z.string();

export const getArcTool: RegisteredTool = {
  allowedNodes: ['chat-hub'],
  description: 'Retrieve the full arc record by arc key: title, objective, escalation, payoff, hook, chapter span and cast. Use before proposing arc.upsert.',
  handler: async (input: unknown, ctx): Promise<unknown> => {
    const parsed = inputSchema.parse(input);
    const arc = await ctx.db.query.arcs.findFirst({
      where: (a, { and, eq }) => and(eq(a.projectId, ctx.projectId), eq(a.arcKey, parsed.arcKey)),
    });
    if (!arc) return `Arc not found: ${parsed.arcKey}`;

    const lines: string[] = [`**${arc.arcKey}**: ${arc.title ?? '(untitled)'} (${arc.status}, ordinal ${arc.ordinal}, volume ${arc.volumeKey})`];
    lines.push(`Chapters: ${arc.chapterStart ?? '?'}–${arc.chapterEnd ?? '?'}`);
    if (arc.objective) lines.push(`Objective: ${arc.objective}`);
    if (arc.escalation) lines.push(`Escalation: ${arc.escalation}`);
    if (arc.payoff) lines.push(`Payoff: ${arc.payoff}`);
    if (arc.hook) lines.push(`Hook: ${arc.hook}`);
    if (arc.cast && arc.cast.length > 0) lines.push(`Cast: ${arc.cast.join(', ')}`);
    if (arc.body) lines.push(arc.body);
    return lines.join('\n');
  },
  inputSchema,
  maxCallsPerRun: 10,
  name: 'get_arc',
  outputSchema,
  tokensBudget: 2000,
};
