import { z } from 'zod';

import { loadIsolationBridges } from '../../../finalize-review/isolation-bridge';
import { standardReadableProse } from '../../isolation-read-policy';
import { type RegisteredTool } from '../types';

const inputSchema = z.object({
  chapter: z.number().int().min(1),
});

const outputSchema = z.string();

const WALLED_OFF_EDIT_HINT = 'To change the text, propose action.revise_draft rather than draft.update.';

export const getDraftTool: RegisteredTool = {
  allowedNodes: ['chat-hub'],
  description:
    'Retrieve a chapter draft: title, status, revision, summary and body (an isolated, unrestricted chapter returns its header and approved bridge summary only). Use before proposing draft.update.',
  handler: async (input: unknown, ctx): Promise<unknown> => {
    const parsed = inputSchema.parse(input);
    const draft = await ctx.db.query.drafts.findFirst({
      where: (d, { and, eq }) => and(eq(d.projectId, ctx.projectId), eq(d.chapter, parsed.chapter)),
    });
    if (!draft) return `Draft not found for chapter ${parsed.chapter}`;

    const title = draft.isolated ? '(title withheld)' : (draft.title ?? '(untitled)');
    const lines: string[] = [`**Chapter ${draft.chapter}**: ${title} (${draft.status}, rev ${draft.revision}, review: ${draft.reviewStatus})`];
    if (draft.words) lines.push(`Words: ${draft.words}`);
    if (draft.isolated) {
      const bridges = await loadIsolationBridges(ctx.db, ctx.projectId, [draft]);
      lines.push(standardReadableProse(draft, bridges.get(draft.chapter)?.summary ?? null), WALLED_OFF_EDIT_HINT);
    } else lines.push(...(draft.summary ? [`Summary: ${draft.summary}`] : []), draft.body);
    return lines.join('\n');
  },
  inputSchema,
  maxCallsPerRun: 2,
  name: 'get_draft',
  outputSchema,
  tokensBudget: 10000,
};
