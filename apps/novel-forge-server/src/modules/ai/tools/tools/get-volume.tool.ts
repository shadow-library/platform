import { z } from 'zod';

import { type RegisteredTool } from '../types';

const inputSchema = z.object({
  volumeKey: z.string(),
});

const outputSchema = z.string();

export const getVolumeTool: RegisteredTool = {
  allowedNodes: ['chat-hub'],
  description: 'Retrieve the full volume record by volume key: title, goal and notes. Use before proposing volume.upsert.',
  handler: async (input: unknown, ctx): Promise<unknown> => {
    const parsed = inputSchema.parse(input);
    const volume = await ctx.db.query.volumes.findFirst({
      where: (v, { and, eq }) => and(eq(v.projectId, ctx.projectId), eq(v.volumeKey, parsed.volumeKey)),
    });
    if (!volume) return `Volume not found: ${parsed.volumeKey}`;

    const lines: string[] = [`**${volume.volumeKey}**: ${volume.title ?? '(untitled)'} (ordinal ${volume.ordinal})`];
    if (volume.objective) lines.push(`Goal: ${volume.objective}`);
    if (volume.body) lines.push(volume.body);
    return lines.join('\n');
  },
  inputSchema,
  maxCallsPerRun: 10,
  name: 'get_volume',
  outputSchema,
  tokensBudget: 2000,
};
