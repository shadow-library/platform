/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

/**
 * Importing user defined packages
 */
import { AUTHORING_STYLE } from './authoring-preamble';
import { type PromptModule } from './types';
import { type PlanOutput, PlanSchema, validatePlanContiguity } from '../schemas/plan.schema';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const system =
  `${AUTHORING_STYLE}\n\nYou are a serialized novel planner. Given the novel skeleton (character arcs and power curve), the target volume count, and chapters_per_volume, produce a volume plan. Each volume is a self-contained arc with a clear objective, central conflict, and payoff. Volumes must together fulfill all major character arcs and the power curve trajectory. Chapter spans must be contiguous. Volumes should escalate in stakes. When the skeleton is missing or thin, derive the arcs from the brief — never return fewer volumes than requested.\n\n` +
  'Respond with ONLY one valid JSON array — nothing outside the JSON, no markdown fences — of exactly this shape, with exactly the requested number of volumes:\n' +
  '[{"volumeKey": "vol_01_snake_case", "ordinal": 1, "title": "...", "objective": "...", "conflict": "...", "payoff": "...", "startChapter": 1, "endChapter": 8, "cast": ["entity-key"]}]';

export const planPrompt: PromptModule<PlanOutput> = {
  key: 'plan',
  version: '1.1.0',
  kind: 'authoring',
  system,
  template: ChatPromptTemplate.fromMessages([
    // The system text embeds a literal JSON example, so it must be a message instance — a
    // ['system', string] tuple would be parsed for {variables} and throw.
    new SystemMessage(system),
    ['human', 'Novel skeleton:\n{skeleton}\n\nTarget: {volumeCount} volumes, {chaptersPerVolume} chapters each — return exactly {volumeCount} volumes.\nBrief: {projectBrief}'],
  ]),
  schema: PlanSchema,
  postValidate: validatePlanContiguity,
};
