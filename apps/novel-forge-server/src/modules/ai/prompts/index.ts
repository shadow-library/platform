import { appearanceDescribePrompt } from './appearance-describe.prompt';
import { bibleAuditPrompt } from './bible-audit.prompt';
import { bibleContradictionPrompt } from './bible-contradiction.prompt';
import { charactersPrompt } from './bible-builder/characters.prompt';
import { factionsLocationsPrompt } from './bible-builder/factions-locations.prompt';
import { foundationPrompt } from './bible-builder/foundation.prompt';
import { plotPrompt } from './bible-builder/plot.prompt';
import { powerPrompt } from './bible-builder/power.prompt';
import { volumesPrompt } from './bible-builder/volumes.prompt';
import { worldPrompt } from './bible-builder/world.prompt';
import { chapterExpandPrompt } from './chapter-expand.prompt';
import { chapterExtractPrompt } from './chapter-extract.prompt';
import { chapterPlanPrompt } from './chapter-plan.prompt';
import { chapterSummarizePrompt } from './chapter-summarize.prompt';
import { chatCompactPrompt } from './chat-compact.prompt';
import { chatTitlePrompt } from './chat-title.prompt';
import { chatRefinePrompt } from './chat-refine.prompt';
import { continuityPrompt } from './continuity.prompt';
import { fixPrompt } from './fix.prompt';
import { generationPrompt } from './generation.prompt';
import { illustrationComposePrompt } from './illustration-compose.prompt';
import { judgePrompt } from './judge.prompt';
import { newNovelPrompt } from './new-novel.prompt';
import { notesOrganisePrompt } from './notes-organise.prompt';
import { outlinePrompt } from './outline.prompt';
import { passageRewritePrompt } from './passage-rewrite.prompt';
import { premiseEnhancePrompt } from './premise-enhance.prompt';
import { reviewPrompt } from './review.prompt';
import { revisionPrompt } from './revision.prompt';
import { titlePrompt } from './title.prompt';
import { type PromptKey, type PromptModule } from './types';
import { validationPrompt } from './validation.prompt';

export const PROMPT_REGISTRY: Record<PromptKey, PromptModule<unknown>> = {
  generation: generationPrompt as PromptModule<unknown>,
  'chapter-expand': chapterExpandPrompt as PromptModule<unknown>,
  judge: judgePrompt as PromptModule<unknown>,
  fix: fixPrompt as PromptModule<unknown>,
  outline: outlinePrompt as PromptModule<unknown>,
  title: titlePrompt as PromptModule<unknown>,
  revision: revisionPrompt as PromptModule<unknown>,
  continuity: continuityPrompt as PromptModule<unknown>,
  'chapter-summarize': chapterSummarizePrompt as PromptModule<unknown>,
  validation: validationPrompt as PromptModule<unknown>,
  review: reviewPrompt as PromptModule<unknown>,
  'new-novel': newNovelPrompt as PromptModule<unknown>,
  'bible:foundation': foundationPrompt as PromptModule<unknown>,
  'bible:world': worldPrompt as PromptModule<unknown>,
  'bible:power': powerPrompt as PromptModule<unknown>,
  'bible:factions-locations': factionsLocationsPrompt as PromptModule<unknown>,
  'bible:characters': charactersPrompt as PromptModule<unknown>,
  'bible:plot': plotPrompt as PromptModule<unknown>,
  'bible:volumes': volumesPrompt as PromptModule<unknown>,
  'premise-enhance': premiseEnhancePrompt as PromptModule<unknown>,
  'bible-audit': bibleAuditPrompt as PromptModule<unknown>,
  'bible-contradiction': bibleContradictionPrompt as PromptModule<unknown>,
  'chat-refine': chatRefinePrompt as PromptModule<unknown>,
  'chat-compact': chatCompactPrompt as PromptModule<unknown>,
  'chat-title': chatTitlePrompt as PromptModule<unknown>,
  'chapter-extract': chapterExtractPrompt as PromptModule<unknown>,
  'illustration-compose': illustrationComposePrompt as PromptModule<unknown>,
  'appearance-describe': appearanceDescribePrompt as PromptModule<unknown>,
  'notes-organise': notesOrganisePrompt as PromptModule<unknown>,
  'chapter-plan': chapterPlanPrompt as PromptModule<unknown>,
  'passage-rewrite': passageRewritePrompt as PromptModule<unknown>,
};

export * from './types';
export * from './authoring-preamble';
export * from './scope-playbooks';
export { buildChatRefinePrompt, chatPromptTokens, chatScopeInstructions, type ChatTurnPermissions, renderTurnRules } from './chat-refine.prompt';
export { CONTRADICTION_OPS } from './bible-contradiction.prompt';
export { buildOutlinePrompt, outlineWordTargetVars } from './outline.prompt';
export { chapterPlanPrompt } from './chapter-plan.prompt';
