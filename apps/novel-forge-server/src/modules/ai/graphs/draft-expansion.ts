import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';

import { countWords, resolveWordTarget } from '../../eval/deterministic-metrics';
import { type ForgeCallPolicy } from '../../plugins/plugin-policy.service';
import { type ModelRouterService, type ProjectConfig } from '../model-router.service';
import { PROMPT_REGISTRY } from '../prompts';
import { type ChapterExpandOutput } from '../schemas/chapter-expand.schema';
import { type TelemetryContext } from '../telemetry.handler';
import { resolveWordCountHardBounds } from './mechanical-check';

// Each pass re-emits the whole chapter, so the bound is what caps the extra output spend at two chapters' worth.
export const DRAFT_EXPANSION_MAX_PASSES = 2;

export interface DraftExpansionInput {
  body: string;
  stableContext: string;
  volatileContext: string;
  chapterBrief: string;
  endingContract: string;
  guidance: string;
}

export interface DraftExpansionResult {
  body: string;
  passes: number;
  initialWords: number;
  finalWords: number;
}

const logger = Logger.getLogger(APP_NAME, 'draft-expansion');

// A failed, shrinking, or runaway pass keeps the best body so far — a short draft is never lost to expansion.
export async function expandShortDraft(
  modelRouter: Pick<ModelRouterService, 'structured'>,
  input: DraftExpansionInput,
  ctx: TelemetryContext,
  project?: ProjectConfig,
  policy?: ForgeCallPolicy,
  maxPasses: number = DRAFT_EXPANSION_MAX_PASSES,
): Promise<DraftExpansionResult> {
  const prompt = PROMPT_REGISTRY['chapter-expand'];
  const target = resolveWordTarget(project);
  const { max: hardMax } = resolveWordCountHardBounds(target);
  const initialWords = countWords(input.body);
  let body = input.body;
  let words = initialWords;
  let passes = 0;

  while (words < target.min && passes < maxPasses) {
    passes++;
    const expandCtx: TelemetryContext = { ...ctx, node: `${ctx.node ?? 'draft'}:expand`, promptKey: prompt.key, promptVersion: prompt.version };
    const vars = { ...input, draftBody: body, draftWords: words, minWords: target.min, aimWords: target.aim, missingWords: target.aim - words };
    const expanded = await (modelRouter.structured(prompt, vars, expandCtx, project, policy) as Promise<ChapterExpandOutput>).catch(err => {
      logger.warn('draft expansion call failed — keeping the current draft', { runId: ctx.runId, node: ctx.node, pass: passes, words, err });
      return null;
    });

    const expandedWords = typeof expanded?.body === 'string' ? countWords(expanded.body) : 0;
    logger.info('draft expansion pass', { runId: ctx.runId, node: ctx.node, pass: passes, words, expandedWords });
    if (!expanded || expandedWords <= words || expandedWords > hardMax) break;
    body = expanded.body;
    words = expandedWords;
  }

  return { body, passes, initialWords, finalWords: words };
}
