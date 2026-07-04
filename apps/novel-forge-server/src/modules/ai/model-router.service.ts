/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { ChatAnthropic } from '@langchain/anthropic';
import { type BaseChatModel } from '@langchain/core/language_models/chat_models';
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

function renderZodIssues(issues: { path: (string | number)[]; message: string }[]): string {
  return issues.map(i => `- ${i.path.join('.')}: ${i.message}`).join('\n');
}

@Injectable()
export class ModelRouterService {
  private readonly logger = Logger.getLogger(APP_NAME, ModelRouterService.name);

  constructor(private readonly telemetry: TelemetryHandler) {}

  resolveModel(role: AiRole, project?: ProjectConfig): ResolvedModel {
    // 1. grok_only forces xAI on every role
    if (project?.contentMode === 'grok_only') return { provider: 'xai', model: Config.get('ai.grokLlmModel') };
    // 2. per-project config override
    const projectModel = (project?.config?.models as Record<string, ResolvedModel> | undefined)?.[role];
    if (projectModel) return projectModel;
    // 3. AI_PROFILE defaults
    return getProfileDefaults()[role] ?? { provider: 'xai', model: Config.get('ai.grokLlmModel') };
  }

  buildClient(resolved: ResolvedModel): BaseChatModel {
    const entry = MODEL_MAP[resolved.model];
    const provider = entry?.provider ?? resolved.provider;

    switch (provider) {
      case 'xai':
        return new ChatXAI({ model: resolved.model, apiKey: Config.get('ai.xaiApiKey') });
      case 'anthropic':
        return new ChatAnthropic({ model: resolved.model, apiKey: Config.get('ai.anthropicApiKey') });
      case 'openai':
        return new ChatOpenAI({ model: resolved.model, apiKey: Config.get('ai.openaiApiKey') });
      case 'ollama':
        // ChatOllama requires @langchain/ollama which has a peer dep on @langchain/core >=1.x.
        // Loaded lazily so version incompatibility does not crash non-Ollama paths.
        // Full Ollama wiring is completed in A10 (local-LLM harness).
        throw new ServerError(AppErrorCode.AI_002);
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

    const parsed1 = promptModule.schema.safeParse(tryParseJson(rawOutput1));
    if (parsed1.success) return parsed1.data;

    this.logger.warn('Attempt 1 parse failed — repairing', { role, issues: parsed1.error.issues.length });

    // ─── Attempt 2: repair ───────────────────────────────────────────────────
    const repairInput = {
      ...input,
      priorOutput: rawOutput1,
      parseIssues: renderZodIssues(parsed1.error.issues),
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

    const parsed2 = promptModule.schema.safeParse(tryParseJson(rawOutput2));
    if (parsed2.success) return parsed2.data;

    // ─── Attempt 3: tolerant extraction ──────────────────────────────────────
    this.logger.warn('Repair parse failed — trying tolerant extraction', { role });
    const extracted = extractJsonBlock(rawOutput2);
    if (extracted) {
      const parsed3 = promptModule.schema.safeParse(extracted);
      if (parsed3.success) return parsed3.data;
    }

    // ─── Fail ────────────────────────────────────────────────────────────────
    this.logger.error('All parse attempts failed', { role, rawOutput1: rawOutput1.slice(0, 200) });
    throw new ServerError(AppErrorCode.AI_001);
  }
}
