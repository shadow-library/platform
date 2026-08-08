import { createHash } from 'node:crypto';

import { type BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, type BaseMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { type DynamicStructuredTool } from '@langchain/core/tools';
import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

import { type RegisteredTool, type ToolContext } from './types';

export interface ToolLoopOptions {
  maxRounds?: number;
}

export interface ToolLoopResult {
  messages: BaseMessage[];
  toolCallCount: number;
}

// ToolCapableModel narrows BaseChatModel to those that implement bindTools.
type ToolCapableModel = BaseChatModel & Required<Pick<BaseChatModel, 'bindTools'>>;

const logger = Logger.getLogger(APP_NAME, 'runToolLoop');

// Bounded tool loop for verification nodes.
// Binds tools to model, runs up to maxRounds, writes audit rows per tool call.
export async function runToolLoop(
  model: BaseChatModel,
  tools: DynamicStructuredTool[],
  rawTools: RegisteredTool[],
  messages: BaseMessage[],
  ctx: ToolContext,
  fullDb: PrimaryDatabase,
  opts?: ToolLoopOptions,
): Promise<ToolLoopResult> {
  const maxRounds = opts?.maxRounds ?? 6;

  // `bindTools` is optional on BaseChatModel and this loop accepts any of them, so a model without
  // native tool-calling stays usable: it answers from the context already assembled in the prompt
  // instead of looking canon up through tools. Degraded but functional — and this check is what
  // narrows the model to ToolCapableModel below.
  if (typeof model.bindTools !== 'function') {
    logger.debug('runToolLoop: model has no bindTools — running tool-free', { node: ctx.node, runId: ctx.runId });
    const response = await model.invoke(messages);
    return { messages: [...messages, response], toolCallCount: 0 };
  }

  const boundModel = (model as ToolCapableModel).bindTools(tools);
  const callCounts = new Map<string, number>();
  const resultMessages: BaseMessage[] = [...messages];
  let toolCallCount = 0;
  let exhaustedBudget = false;

  for (let round = 0; round < maxRounds; round++) {
    const response = (await boundModel.invoke(resultMessages)) as AIMessage;
    resultMessages.push(response);

    if (!response.tool_calls || response.tool_calls.length === 0) break;

    for (const tc of response.tool_calls) {
      toolCallCount++;
      const rawTool = rawTools.find(t => t.name === tc.name);
      const callCount = (callCounts.get(tc.name) ?? 0) + 1;
      callCounts.set(tc.name, callCount);
      const startedAt = Date.now();
      logger.debug('runToolLoop: tool call', { node: ctx.node, runId: ctx.runId, round, tool: tc.name, callCount, args: tc.args });

      let resultStr: string;
      let auditStatus: 'budget_exceeded' | 'handler_error' | 'invalid_args' | 'ok';

      if (rawTool && callCount > rawTool.maxCallsPerRun) {
        resultStr = `error: tool '${tc.name}' has exceeded its call budget for this run`;
        auditStatus = 'budget_exceeded';
      } else if (!rawTool) {
        resultStr = `error: unknown tool '${tc.name}'`;
        auditStatus = 'invalid_args';
      } else {
        const parsed = rawTool.inputSchema.safeParse(tc.args);
        if (!parsed.success) {
          resultStr = `error: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`;
          auditStatus = 'invalid_args';
        } else {
          try {
            const result = await rawTool.handler(parsed.data, ctx);
            resultStr = typeof result === 'string' ? result : JSON.stringify(result);
            if (rawTool.tokensBudget > 0 && resultStr.length > rawTool.tokensBudget * 4) {
              resultStr = resultStr.slice(0, rawTool.tokensBudget * 4) + '\n...[truncated]';
            }
            auditStatus = 'ok';
          } catch (err) {
            logger.error('Tool handler error', { err, tool: tc.name });
            resultStr = 'error: lookup failed';
            auditStatus = 'handler_error';
          }
        }
      }

      const digest = createHash('sha256').update(resultStr).digest('hex').slice(0, 16);
      await fullDb
        .insert(schema.toolCalls)
        .values({
          args: tc.args as Record<string, unknown>,
          latencyMs: Date.now() - startedAt,
          node: ctx.node,
          resultDigest: digest,
          runId: ctx.runId,
          status: auditStatus,
          tool: tc.name,
        })
        .catch(err => logger.error('Failed to write tool_call audit row', { err }));

      resultMessages.push(new ToolMessage({ content: resultStr, tool_call_id: tc.id ?? '' }));
    }

    if (round === maxRounds - 1) exhaustedBudget = true;
  }

  if (exhaustedBudget) {
    logger.debug('runToolLoop: tool budget exhausted — forcing a final answer', { node: ctx.node, runId: ctx.runId, maxRounds, toolCallCount });
    resultMessages.push(new HumanMessage('Tool budget exhausted — answer with what you have.'));
    const finalResponse = (await model.invoke(resultMessages)) as BaseMessage;
    resultMessages.push(finalResponse);
  }

  return { messages: resultMessages, toolCallCount };
}
