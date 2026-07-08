/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { arcPlanPrompt } from './arc-plan.prompt';
import { bibleAuditPrompt } from './bible-audit.prompt';
import { charactersPrompt } from './bible-builder/characters.prompt';
import { factionsLocationsPrompt } from './bible-builder/factions-locations.prompt';
import { foundationPrompt } from './bible-builder/foundation.prompt';
import { plotPrompt } from './bible-builder/plot.prompt';
import { volumesPrompt } from './bible-builder/volumes.prompt';
import { worldPowerPrompt } from './bible-builder/world-power.prompt';
import { chatCompactPrompt } from './chat-compact.prompt';
import { chatRefinePrompt } from './chat-refine.prompt';
import { continuityPrompt } from './continuity.prompt';
import { extractionPrompt } from './extraction.prompt';
import { fixPrompt } from './fix.prompt';
import { generationPrompt } from './generation.prompt';
import { judgePrompt } from './judge.prompt';
import { newNovelPrompt } from './new-novel.prompt';
import { outlinePrompt } from './outline.prompt';
import { planPrompt } from './plan.prompt';
import { premiseEnhancePrompt } from './premise-enhance.prompt';
import { reviewPrompt } from './review.prompt';
import { revisionPrompt } from './revision.prompt';
import { skeletonPrompt } from './skeleton.prompt';
import { titlePrompt } from './title.prompt';
import { type PromptKey, type PromptModule } from './types';
import { validationPrompt } from './validation.prompt';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export const PROMPT_REGISTRY: Record<PromptKey, PromptModule<unknown>> = {
  extraction: extractionPrompt as PromptModule<unknown>,
  generation: generationPrompt as PromptModule<unknown>,
  judge: judgePrompt as PromptModule<unknown>,
  fix: fixPrompt as PromptModule<unknown>,
  outline: outlinePrompt as PromptModule<unknown>,
  title: titlePrompt as PromptModule<unknown>,
  revision: revisionPrompt as PromptModule<unknown>,
  continuity: continuityPrompt as PromptModule<unknown>,
  validation: validationPrompt as PromptModule<unknown>,
  review: reviewPrompt as PromptModule<unknown>,
  'new-novel': newNovelPrompt as PromptModule<unknown>,
  plan: planPrompt as PromptModule<unknown>,
  skeleton: skeletonPrompt as PromptModule<unknown>,
  'bible:foundation': foundationPrompt as PromptModule<unknown>,
  'bible:world-power': worldPowerPrompt as PromptModule<unknown>,
  'bible:factions-locations': factionsLocationsPrompt as PromptModule<unknown>,
  'bible:characters': charactersPrompt as PromptModule<unknown>,
  'bible:plot': plotPrompt as PromptModule<unknown>,
  'bible:volumes': volumesPrompt as PromptModule<unknown>,
  'premise-enhance': premiseEnhancePrompt as PromptModule<unknown>,
  'bible-audit': bibleAuditPrompt as PromptModule<unknown>,
  'chat-refine': chatRefinePrompt as PromptModule<unknown>,
  'chat-compact': chatCompactPrompt as PromptModule<unknown>,
  'arc-plan': arcPlanPrompt as PromptModule<unknown>,
};

export * from './types';
export * from './authoring-preamble';
export * from './scope-playbooks';
export { buildChatRefinePrompt } from './chat-refine.prompt';
export { buildArcPlanPrompt } from './arc-plan.prompt';
