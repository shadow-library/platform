import { z } from 'zod';

import { type RegisteredTool } from '../types';

const inputSchema = z.object({
  chapter: z.number().int().min(1),
});

const outputSchema = z.string();

export const getBriefTool: RegisteredTool = {
  allowedNodes: ['chat-hub'],
  description: 'Retrieve the full brief for a chapter, including its ending contract and knowledge contract. Use before proposing brief.update.',
  handler: async (input: unknown, ctx): Promise<unknown> => {
    const parsed = inputSchema.parse(input);
    const brief = await ctx.db.query.briefs.findFirst({
      where: (b, { and, eq }) => and(eq(b.projectId, ctx.projectId), eq(b.chapter, parsed.chapter)),
    });
    if (!brief) return `Brief not found for chapter ${parsed.chapter}`;

    const lines: string[] = [`**Chapter ${brief.chapter}**: ${brief.title ?? '(untitled)'} (rev ${brief.revision}, ${brief.writeMode})`];
    if (brief.handEdited) lines.push('Hand-edited: this brief will not be overwritten by arc reconciliation.');
    lines.push(`Volume: ${brief.volumeKey ?? '?'} / Arc: ${brief.arcKey ?? '?'} / POV: ${brief.pov ?? '?'}`);
    if (brief.chapterPurpose) lines.push(`Purpose: ${brief.chapterPurpose}`);
    lines.push(brief.body);
    if (brief.contextRefs && brief.contextRefs.length > 0) lines.push(`Context refs: ${brief.contextRefs.join(', ')}`);
    if (brief.endingContract) lines.push(`Ending contract: ${JSON.stringify(brief.endingContract)}`);
    if (brief.knowledgeContract) lines.push(`Knowledge contract: ${JSON.stringify(brief.knowledgeContract)}`);
    if (brief.readerValue) lines.push(`Reader value: ${JSON.stringify(brief.readerValue)}`);
    if (brief.repetitionRisks) lines.push(`Repetition risks: ${JSON.stringify(brief.repetitionRisks)}`);
    return lines.join('\n');
  },
  inputSchema,
  maxCallsPerRun: 8,
  name: 'get_brief',
  outputSchema,
  tokensBudget: 5000,
};
