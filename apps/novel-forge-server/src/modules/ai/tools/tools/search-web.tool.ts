import { z } from 'zod';

import { AppErrorCode } from '@server/classes';

import { pageKey, UNTRUSTED_WEB_NOTE } from '../../web';
import { type RegisteredTool } from '../types';

const inputSchema = z.object({ query: z.string().trim().min(2).max(400) });

export const searchWebTool: RegisteredTool = {
  allowedNodes: ['chat-hub'],
  description:
    'Search the web for real-world facts and research that neither the novel nor your own knowledge settles — places, history, science, how something works, recent events, or what the author asked you to look up. Returns titles, URLs and short snippets; read a result in full with fetch_page.',
  handler: async (input: unknown, ctx): Promise<unknown> => {
    const { query } = inputSchema.parse(input);
    if (!ctx.web) throw AppErrorCode.AI_019.create();
    const results = await ctx.web.search(query);
    if (results.length === 0) return 'No web results.';
    for (const result of results) ctx.web.fetchable.add(pageKey(result.url));
    const listed = results.map((result, index) => `[${index + 1}] ${result.title}\n${result.url}${result.age ? ` · ${result.age}` : ''}\n${result.snippet}`);
    return `${UNTRUSTED_WEB_NOTE}\n\n${listed.join('\n\n')}`;
  },
  inputSchema,
  maxCallsPerRun: 5,
  name: 'search_web',
  outputSchema: z.string(),
  tokensBudget: 2000,
};
