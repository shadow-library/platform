import { z } from 'zod';

import { AppErrorCode } from '@server/classes';

import { pageKey, UNTRUSTED_WEB_NOTE } from '../../web';
import { type RegisteredTool } from '../types';

const inputSchema = z.object({ url: z.string().trim().max(2000) });

export const fetchPageTool: RegisteredTool = {
  allowedNodes: ['chat-hub'],
  description:
    'Read a web page as plain text. Only a URL that search_web returned this turn, or that the author wrote in the conversation, can be fetched — search first for anything else.',
  handler: async (input: unknown, ctx): Promise<unknown> => {
    const { url } = inputSchema.parse(input);
    if (!ctx.web) throw AppErrorCode.AI_019.create();
    if (!ctx.web.fetchable.has(pageKey(url))) {
      throw AppErrorCode.AI_021.create({ reason: 'only a page this turn’s search returned, or one the author linked, can be fetched — search for it first' });
    }
    const page = await ctx.web.fetch(url);
    const heading = page.title ? `# ${page.title}\n` : '';
    return `${UNTRUSTED_WEB_NOTE}\n\nSource: ${page.url}\n${heading}\n${page.text || '(the page has no readable text)'}`;
  },
  inputSchema,
  maxCallsPerRun: 3,
  name: 'fetch_page',
  outputSchema: z.string(),
  tokensBudget: 3000,
};
