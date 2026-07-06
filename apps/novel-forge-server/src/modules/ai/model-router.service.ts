/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { ChatAnthropic } from '@langchain/anthropic';
import { type BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOllama } from '@langchain/ollama';
import { ChatOpenAI } from '@langchain/openai';
import { ChatXAI } from '@langchain/xai';
import { Injectable } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

import { type AiRole, type ResolvedModel, getProfileDefaults } from './defaults';
import { MODEL_MAP } from './models';
import { type PromptModule } from './prompts/types';
import { type SchemaIssue, type SchemaParseResult, parseSchema, renderSchemaIssues } from './schemas/validate';
import { ChatClaudeCode, ChatCodex } from './subprocess-providers';
import { type TelemetryContext, TelemetryHandler } from './telemetry.handler';

/**
 * Defining types
 */

export interface ProjectConfig {
  contentMode?: string;
  config?: { models?: Partial<Record<AiRole, ResolvedModel>> } | null;
}

/**
 * Declaring the constants
 */

function extractJsonBlock(text: string): unknown {
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (text[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          start = -1;
        }
      }
    }
  }
  return null;
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return extractJsonBlock(raw);
  }
}

// Runs postValidate (if declared) after schema validation succeeds, folding any returned issue
// messages into the same success/failure shape so the repair ladder treats them identically.
function applyPostValidate<T>(result: SchemaParseResult<T>, postValidate?: (data: T) => string[]): SchemaParseResult<T> {
  if (!result.success || !postValidate) return result;
  const messages = postValidate(result.data);
  if (messages.length === 0) return result;
  const issues: SchemaIssue[] = messages.map(message => ({ path: [], message }));
  return { success: false, issues };
}

@Injectable()
export class ModelRouterService {
  private readonly logger = Logger.getLogger(APP_NAME, ModelRouterService.name);

  constructor(private readonly telemetry: TelemetryHandler) {}

  resolveModel(role: AiRole, project?: ProjectConfig): ResolvedModel {
    // 1. grok_only forces xAI on every role
    if (project?.contentMode === 'grok_only') return { provider: 'xai', model: Config.get('ai.grok.llm.model') };
    // 2. per-project config override
    const projectModel = (project?.config?.models as Record<string, ResolvedModel> | undefined)?.[role];
    if (projectModel) return projectModel;
    // 3. AI_PROFILE defaults
    return getProfileDefaults()[role] ?? { provider: 'xai', model: Config.get('ai.grok.llm.model') };
  }

  buildClient(resolved: ResolvedModel): BaseChatModel {
    const entry = MODEL_MAP[resolved.model];
    const provider = entry?.provider ?? resolved.provider;

    switch (provider) {
      case 'xai':
        return new ChatXAI({ model: resolved.model, apiKey: Config.get('ai.xai.api.key') });
      case 'anthropic':
        return new ChatAnthropic({ model: resolved.model, apiKey: Config.get('ai.anthropic.api.key') });
      case 'openai':
        return new ChatOpenAI({ model: resolved.model, apiKey: Config.get('ai.openai.api.key') });
      case 'ollama':
        return new ChatOllama({ model: resolved.model, baseUrl: Config.get('ai.ollama.host'), temperature: 0 });
      case 'anthropic-claude-code':
        if (!Config.get('ai.claude-code.enabled')) throw new ServerError(AppErrorCode.AI_002);
        return new ChatClaudeCode(Config.get('ai.claude-code.bin'));
      case 'openai-codex':
        if (!Config.get('ai.codex.enabled')) throw new ServerError(AppErrorCode.AI_002);
        return new ChatCodex(Config.get('ai.codex.bin'));
      default:
        throw new ServerError(AppErrorCode.AI_002);
    }
  }

  chatFor(role: AiRole, project?: ProjectConfig): BaseChatModel {
    const resolved = this.resolveModel(role, project);
    this.logger.debug(`Routing role=${role} to provider=${resolved.provider} model=${resolved.model}`);
    return this.buildClient(resolved);
  }

  async structured<T>(promptModule: PromptModule<T>, input: Record<string, unknown>, ctx: TelemetryContext, project?: ProjectConfig): Promise<T> {
    const role = promptModule.key as AiRole;
    const resolved = this.resolveModel(role, project);
    const llm = this.buildClient(resolved);
    const chain = promptModule.template.pipe(llm);

    // ─── Attempt 1: invoke ───────────────────────────────────────────────────
    const start1 = Date.now();
    let rawOutput1 = '';

    try {
      const result = await chain.invoke(input, { callbacks: [this.telemetry] });
      rawOutput1 = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
    } catch (err) {
      this.logger.warn('LLM transport error on attempt 1', { role, err });
      throw new ServerError(AppErrorCode.AI_001);
    }

    const latency1 = Date.now() - start1;
    this.logger.debug(`Attempt 1 complete`, { role, latencyMs: latency1, rawLength: rawOutput1.length });

    const parsed1 = applyPostValidate(parseSchema<T>(promptModule.schema, tryParseJson(rawOutput1)), promptModule.postValidate);
    if (parsed1.success) return parsed1.data;

    this.logger.warn('Attempt 1 parse failed — repairing', { role, issues: parsed1.issues.length });

    // ─── Attempt 2: repair ───────────────────────────────────────────────────
    const repairInput = {
      ...input,
      priorOutput: rawOutput1,
      parseIssues: renderSchemaIssues(parsed1.issues),
      instruction: 'The previous response could not be parsed. Fix the JSON so it matches the required schema. Output ONLY valid JSON.',
    };

    let rawOutput2 = '';
    try {
      const result2 = await chain.invoke(repairInput, { callbacks: [this.telemetry] });
      rawOutput2 = typeof result2.content === 'string' ? result2.content : JSON.stringify(result2.content);
    } catch (err) {
      this.logger.warn('LLM transport error on repair attempt', { role, err });
      throw new ServerError(AppErrorCode.AI_001);
    }

    const parsed2 = applyPostValidate(parseSchema<T>(promptModule.schema, tryParseJson(rawOutput2)), promptModule.postValidate);
    if (parsed2.success) return parsed2.data;

    // ─── Attempt 3: tolerant extraction ──────────────────────────────────────
    this.logger.warn('Repair parse failed — trying tolerant extraction', { role });
    const extracted = extractJsonBlock(rawOutput2);
    if (extracted) {
      const parsed3 = applyPostValidate(parseSchema<T>(promptModule.schema, extracted), promptModule.postValidate);
      if (parsed3.success) return parsed3.data;
    }

    // ─── Fail ────────────────────────────────────────────────────────────────
    this.logger.error('All parse attempts failed', { role, rawOutput1: rawOutput1.slice(0, 200) });
    throw new ServerError(AppErrorCode.AI_001);
  }
}
