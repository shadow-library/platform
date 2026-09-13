import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type TranslationAuditOutput, TranslationAuditSchema } from '../schemas/translation.schema';
import { type PromptModule } from './types';

const system =
  'You audit one translated chapter against its original. You receive the style notes, the glossary slice used for the translation, and the chapter as aligned segment pairs — the original segment followed by its translation. Compare each pair and report ONLY these failures: content in the original that is missing from the translation (`omission`); content in the translation that the original does not contain (`addition`); a statement whose meaning changed, numbers, ranks and power-system mechanics included (`meaning_shift`); a passage whose register, humour or emotional colour changed (`tone_shift`); a glossary term rendered differently from the slice or inconsistently across the chapter (`terminology`); explicit, violent or otherwise strong material softened or dropped (`censorship`); and text left in the original language (`untranslated`).\n\n' +
  'Do NOT critique the prose — word choice, sentence rhythm and English style are the translator’s, and flagging them causes pointless repair churn. Natural English that carries the original’s sense is correct even when it shares no structure with it. Give the 1-based `segmentIndex` of the pair whenever the issue sits in one segment — the repair pass re-translates only the segments you flag; omit it only for an issue that spans the whole chapter, such as a term rendered inconsistently across several segments. When none of the above is violated, the verdict is clean and issues is empty.\n\n' +
  'Respond with ONLY one valid JSON object — nothing outside the JSON, no markdown fences — of exactly this shape:\n' +
  '{"verdict": "clean|issues", "issues": [{"type": "omission|addition|meaning_shift|tone_shift|terminology|censorship|untranslated", "segmentIndex": number, "detail": string, "excerpt": string}]}';

export const translateAuditPrompt: PromptModule<TranslationAuditOutput> = {
  key: 'translate-audit',
  version: '1.0.0',
  kind: 'analytical',
  role: 'audit',
  system,
  template: ChatPromptTemplate.fromMessages([
    new SystemMessage(system),
    ['human', 'Style notes:\n{styleNotes}\n\nGlossary:\n{glossarySlice}'],
    ['human', 'Aligned segments (original then translation, per segment):\n{pairs}'],
  ]),
  schema: TranslationAuditSchema,
  postValidate: data => {
    if (data.verdict === 'issues' && data.issues.length === 0) return ['verdict "issues" requires at least one issue'];
    if (data.verdict === 'clean' && data.issues.length > 0) return ['verdict "clean" must have an empty issues list'];
    return [];
  },
};
