import { arcPlanPrompt } from './arc-plan.prompt';
import { bibleAuditPrompt } from './bible-audit.prompt';
import { charactersPrompt } from './bible-builder/characters.prompt';
import { factionsLocationsPrompt } from './bible-builder/factions-locations.prompt';
import { foundationPrompt } from './bible-builder/foundation.prompt';
import { plotPrompt } from './bible-builder/plot.prompt';
import { volumesPrompt } from './bible-builder/volumes.prompt';
import { worldPowerPrompt } from './bible-builder/world-power.prompt';
import { chapterExtractPrompt } from './chapter-extract.prompt';
import { chatCompactPrompt } from './chat-compact.prompt';
import { chatRefinePrompt } from './chat-refine.prompt';
import { continuityPrompt } from './continuity.prompt';
import { epitomePrompt } from './epitome.prompt';
import { extractionPrompt } from './extraction.prompt';
import { fixPrompt } from './fix.prompt';
import { generationPrompt } from './generation.prompt';
import { illustrationComposePrompt } from './illustration-compose.prompt';
import { judgePrompt } from './judge.prompt';
import { newNovelPrompt } from './new-novel.prompt';
import { outlinePrompt } from './outline.prompt';
import { planPrompt } from './plan.prompt';
import { premiseEnhancePrompt } from './premise-enhance.prompt';
import { rebrandAuditPrompt } from './rebrand-audit.prompt';
import { rebrandConvertPrompt } from './rebrand-convert.prompt';
import { rebrandGlossaryPrompt } from './rebrand-glossary.prompt';
import { recombinePrompt } from './recombine.prompt';
import { reforgeAnalyzeWindowPrompt } from './reforge-analyze-window.prompt';
import { reforgeJudgePrompt } from './reforge-judge.prompt';
import { reforgeOutlinePrompt } from './reforge-outline.prompt';
import { reforgePlanPrompt } from './reforge-plan.prompt';
import { reforgeSynthesizePrompt } from './reforge-synthesize.prompt';
import { reforgeTransformJudgePrompt } from './reforge-transform-judge.prompt';
import { reforgeTransformWritePrompt } from './reforge-transform-write.prompt';
import { reforgeWritePrompt } from './reforge-write.prompt';
import { reviewPrompt } from './review.prompt';
import { revisionPrompt } from './revision.prompt';
import { skeletonPrompt } from './skeleton.prompt';
import { titlePrompt } from './title.prompt';
import { type PromptKey, type PromptModule } from './types';
import { validationPrompt } from './validation.prompt';

export const PROMPT_REGISTRY: Record<PromptKey, PromptModule<unknown>> = {
  extraction: extractionPrompt as PromptModule<unknown>,
  generation: generationPrompt as PromptModule<unknown>,
  judge: judgePrompt as PromptModule<unknown>,
  fix: fixPrompt as PromptModule<unknown>,
  outline: outlinePrompt as PromptModule<unknown>,
  title: titlePrompt as PromptModule<unknown>,
  revision: revisionPrompt as PromptModule<unknown>,
  continuity: continuityPrompt as PromptModule<unknown>,
  epitome: epitomePrompt as PromptModule<unknown>,
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
  'chapter-extract': chapterExtractPrompt as PromptModule<unknown>,
  'rebrand-glossary': rebrandGlossaryPrompt as PromptModule<unknown>,
  'rebrand-convert': rebrandConvertPrompt as PromptModule<unknown>,
  'rebrand-audit': rebrandAuditPrompt as PromptModule<unknown>,
  'reforge-outline': reforgeOutlinePrompt as PromptModule<unknown>,
  'reforge-write': reforgeWritePrompt as PromptModule<unknown>,
  'reforge-judge': reforgeJudgePrompt as PromptModule<unknown>,
  'reforge-analyze-window': reforgeAnalyzeWindowPrompt as PromptModule<unknown>,
  'reforge-synthesize': reforgeSynthesizePrompt as PromptModule<unknown>,
  'reforge-plan': reforgePlanPrompt as PromptModule<unknown>,
  'reforge-transform-write': reforgeTransformWritePrompt as PromptModule<unknown>,
  'reforge-transform-judge': reforgeTransformJudgePrompt as PromptModule<unknown>,
  recombine: recombinePrompt as PromptModule<unknown>,
  'illustration-compose': illustrationComposePrompt as PromptModule<unknown>,
};

export * from './types';
export * from './authoring-preamble';
export * from './scope-playbooks';
export { buildChatRefinePrompt } from './chat-refine.prompt';
export { buildArcPlanPrompt } from './arc-plan.prompt';
export { buildOutlinePrompt } from './outline.prompt';
export { renderReforgeFidelityGuidance } from './reforge-write.prompt';
export { renderReforgeFidelityRule } from './reforge-judge.prompt';
