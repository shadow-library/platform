import { createHash } from 'node:crypto';

import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/database';

import { RetrievalService } from '../ai/retrieval';
import { type RegisteredTool, type ToolContext, ToolRegistryService } from '../ai/tools';
import { type WebLookups, type WebMode } from '../ai/web';
import { type EmitterRelay } from './chat-turn-emitter';
import { type TurnTraceCollector } from './chat-turn-trace';
import { readsPlannerOnlyPage } from './planner-only-guard';

interface LookupObservers {
  round: number;
  relay: EmitterRelay | null;
  trace: TurnTraceCollector;
  planner: { read: boolean };
  web?: WebLookups;
  webMode: WebMode;
}

// A web lookup's refusal says why — not configured, the engine failed, or the page is off limits — so the model can search again or answer
// without it; every other handler failure stays the bare "lookup failed".
const WEB_LOOKUP_REFUSALS: ReadonlySet<string> = new Set([AppErrorCode.AI_019.code, AppErrorCode.AI_020.code, AppErrorCode.AI_021.code]);

const CHAT_HUB_NODE = 'chat-hub';

@Injectable()
export class ChatLookupService {
  private readonly logger = Logger.getLogger(APP_NAME, ChatLookupService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly retrievalService: RetrievalService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  tools(webMode: WebMode): RegisteredTool[] {
    return this.toolRegistry.getRaw(CHAT_HUB_NODE, webMode);
  }

  /** Runs declared lookups with the tool loop's audit and budgets; `callCounts` is passed in so `maxCallsPerRun` holds across a turn's rounds, not on the singleton service. */
  async executeLookups(
    projectId: bigint,
    runId: string,
    lookups: { tool: string; args?: Record<string, unknown> }[],
    callCounts: Map<string, number>,
    { round, relay, trace, planner, web, webMode }: LookupObservers,
  ): Promise<string> {
    const rawTools = this.toolRegistry.getRaw(CHAT_HUB_NODE, webMode);
    const ctx: ToolContext = { chapter: null, db: this.db, node: CHAT_HUB_NODE, projectId, retrieval: this.retrievalService, runId, web };
    const blocks: string[] = [];

    for (const lookup of lookups) {
      const args = lookup.args ?? {};
      relay?.lookup({ round, tool: lookup.tool, args: { ...args }, status: 'running' });
      trace.lookupStarted();
      const rawTool = rawTools.find(t => t.name === lookup.tool);
      const callCount = (callCounts.get(lookup.tool) ?? 0) + 1;
      callCounts.set(lookup.tool, callCount);
      const startedAt = Date.now();

      let resultStr: string;
      let auditStatus: 'budget_exceeded' | 'handler_error' | 'invalid_args' | 'ok';
      if (!rawTool) {
        resultStr = `error: unknown tool '${lookup.tool}'`;
        auditStatus = 'invalid_args';
      } else if (callCount > rawTool.maxCallsPerRun) {
        resultStr = `error: tool '${lookup.tool}' has exceeded its call budget for this turn`;
        auditStatus = 'budget_exceeded';
      } else {
        const parsed = rawTool.inputSchema.safeParse(args);
        if (!parsed.success) {
          resultStr = `error: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`;
          auditStatus = 'invalid_args';
        } else {
          try {
            const result = await rawTool.handler(parsed.data, ctx);
            resultStr = typeof result === 'string' ? result : JSON.stringify(result);
            if (rawTool.tokensBudget > 0 && resultStr.length > rawTool.tokensBudget * 4) resultStr = resultStr.slice(0, rawTool.tokensBudget * 4) + '\n...[truncated]';
            auditStatus = 'ok';
            if (readsPlannerOnlyPage(lookup.tool, parsed.data)) planner.read = true;
          } catch (err) {
            const refusal = AppError.is(err) && WEB_LOOKUP_REFUSALS.has(err.code);
            if (refusal) this.logger.warn('web lookup refused', { tool: lookup.tool, code: err.code, reason: err.message });
            else this.logger.error('lookup handler error', { err, tool: lookup.tool });
            resultStr = refusal ? `error: ${err.message}` : 'error: lookup failed';
            auditStatus = 'handler_error';
          }
        }
      }

      // Copied, not shared: `args` is the object the audit row below stores, and a subscriber that
      // redacts what it is handed in place would rewrite that row.
      const status = auditStatus === 'ok' ? 'ok' : 'error';
      relay?.lookup({ round, tool: lookup.tool, args: { ...args }, status });
      trace.lookupSettled(lookup.tool, args, status);

      const digest = createHash('sha256').update(resultStr).digest('hex').slice(0, 16);
      await this.db
        .insert(schema.toolCalls)
        .values({ args, latencyMs: Date.now() - startedAt, node: CHAT_HUB_NODE, resultDigest: digest, runId, status: auditStatus, tool: lookup.tool })
        .catch(err => this.logger.error('failed to write lookup audit row', { err }));
      blocks.push(`### ${lookup.tool}\n${resultStr}`);
    }
    return blocks.join('\n\n');
  }
}
