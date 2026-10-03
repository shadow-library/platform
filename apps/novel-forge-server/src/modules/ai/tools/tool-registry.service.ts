import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { Injectable } from '@shadow-library/app';

import { type WebMode } from '../web';
import { fetchPageTool } from './tools/fetch-page.tool';
import { getBibleDocumentTool } from './tools/get-bible-document.tool';
import { getBriefTool } from './tools/get-brief.tool';
import { getCanonFactsTool } from './tools/get-canon-facts.tool';
import { getCharacterTimelineTool } from './tools/get-character-timeline.tool';
import { getChapterSummariesTool } from './tools/get-chapter-summaries.tool';
import { getDraftTool } from './tools/get-draft.tool';
import { getEntityTool } from './tools/get-entity.tool';
import { getNotesTool } from './tools/get-notes.tool';
import { getPlotThreadsTool } from './tools/get-plot-threads.tool';
import { getReviewTool } from './tools/get-review.tool';
import { getUsageTool } from './tools/get-usage.tool';
import { getVolumeTool } from './tools/get-volume.tool';
import { getWorldFactsTool } from './tools/get-world-facts.tool';
import { searchLoreTool } from './tools/search-lore.tool';
import { searchProseTool } from './tools/search-prose.tool';
import { searchWebTool } from './tools/search-web.tool';
import { type RegisteredTool, type ToolContext } from './types';

const ALL_TOOLS: RegisteredTool[] = [
  searchLoreTool,
  getEntityTool,
  getChapterSummariesTool,
  searchProseTool,
  getWorldFactsTool,
  getPlotThreadsTool,
  getBibleDocumentTool,
  getVolumeTool,
  getBriefTool,
  getDraftTool,
  getCanonFactsTool,
  getNotesTool,
  getCharacterTimelineTool,
  getUsageTool,
  getReviewTool,
];

// Offered only on a turn that reaches the web through Brave: a model the gateway runs with its own web search uses that instead.
const WEB_TOOLS: RegisteredTool[] = [searchWebTool, fetchPageTool];

export function toolsForNode(nodeName: string, web: WebMode = 'off'): RegisteredTool[] {
  const tools = web === 'brave' ? [...ALL_TOOLS, ...WEB_TOOLS] : ALL_TOOLS;
  return tools.filter(t => t.allowedNodes.includes(nodeName));
}

@Injectable()
export class ToolRegistryService {
  // The ctx is captured in each tool's func closure.
  forNode(nodeName: string, ctx: ToolContext): DynamicStructuredTool[] {
    return toolsForNode(nodeName).map(
      rawTool =>
        new DynamicStructuredTool({
          description: rawTool.description,
          func: async (input: Record<string, unknown>): Promise<string> => {
            const result = await rawTool.handler(input, ctx);
            let resultStr = typeof result === 'string' ? result : JSON.stringify(result);
            if (rawTool.tokensBudget > 0 && resultStr.length > rawTool.tokensBudget * 4) {
              resultStr = resultStr.slice(0, rawTool.tokensBudget * 4) + '\n...[truncated]';
            }
            return resultStr;
          },
          name: rawTool.name,
          schema: rawTool.inputSchema as z.ZodObject<any, any, any>,
        }),
    );
  }

  getRaw(nodeName: string, web: WebMode = 'off'): RegisteredTool[] {
    return toolsForNode(nodeName, web);
  }
}
