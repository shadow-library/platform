/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { Injectable } from '@shadow-library/app';
import { z } from 'zod';

/**
 * Importing user defined packages
 */
import { getChapterSummariesTool } from './tools/get-chapter-summaries.tool';
import { getEntityTool } from './tools/get-entity.tool';
import { getPlotThreadsTool } from './tools/get-plot-threads.tool';
import { getWorldFactsTool } from './tools/get-world-facts.tool';
import { searchLoreTool } from './tools/search-lore.tool';
import { searchProseTool } from './tools/search-prose.tool';
import { type RegisteredTool, type ToolContext } from './types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const ALL_TOOLS: RegisteredTool[] = [searchLoreTool, getEntityTool, getChapterSummariesTool, searchProseTool, getWorldFactsTool, getPlotThreadsTool];

@Injectable()
export class ToolRegistryService {
  // Returns DynamicStructuredTool[] for the given node — only tools with that node in allowedNodes.
  // The ctx is captured in each tool's func closure.
  forNode(nodeName: string, ctx: ToolContext): DynamicStructuredTool[] {
    return ALL_TOOLS.filter(t => t.allowedNodes.includes(nodeName)).map(
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

  // Returns raw RegisteredTool definitions for the given node (used by runToolLoop).
  getRaw(nodeName: string): RegisteredTool[] {
    return ALL_TOOLS.filter(t => t.allowedNodes.includes(nodeName));
  }
}
