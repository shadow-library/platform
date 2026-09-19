import { z } from 'zod';

import { type RegisteredTool } from '../types';

const inputSchema = z.object({
  volumeKey: z.string(),
});

const outputSchema = z.string();

export const getVolumeTool: RegisteredTool = {
  allowedNodes: ['chat-hub'],
  description: 'Retrieve the full volume record by volume key: title, objective, conflict, payoff, chapter range, cast and body. Use before proposing volume.upsert.',
  handler: async (input: unknown, ctx): Promise<unknown> => {
    const parsed = inputSchema.parse(input);
    const volume = await ctx.db.query.volumes.findFirst({
      where: (v, { and, eq }) => and(eq(v.projectId, ctx.projectId), eq(v.volumeKey, parsed.volumeKey)),
    });
    if (!volume) return `Volume not found: ${parsed.volumeKey}`;

    const lines: string[] = [`**${volume.volumeKey}**: ${volume.title ?? '(untitled)'} (${volume.status}, ordinal ${volume.ordinal})`];
    lines.push(`Chapters: ${volume.startChapter ?? '?'}–${volume.endChapter ?? '?'}${volume.targetChapterCount ? ` (target ${volume.targetChapterCount})` : ''}`);
    if (volume.objective) lines.push(`Objective: ${volume.objective}`);
    if (volume.conflict) lines.push(`Conflict: ${volume.conflict}`);
    if (volume.payoff) lines.push(`Payoff: ${volume.payoff}`);
    if (volume.cast && volume.cast.length > 0) lines.push(`Cast: ${volume.cast.join(', ')}`);
    if (volume.epitome) lines.push(`Epitome: ${volume.epitome}`);
    if (volume.body) lines.push(volume.body);
    return lines.join('\n');
  },
  inputSchema,
  maxCallsPerRun: 10,
  name: 'get_volume',
  outputSchema,
  tokensBudget: 2000,
};
