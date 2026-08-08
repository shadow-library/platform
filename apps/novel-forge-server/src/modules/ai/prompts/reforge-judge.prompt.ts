import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type ReforgeJudgeOutput, ReforgeJudgeSchema } from '../schemas/reforge.schema';
import { type PromptModule } from './types';

const system =
  'You audit one re-authored chapter for fidelity to its source outline. You receive the faithful OUTLINE the chapter was written from, the WORLD NOTES, the GLOSSARY slice, and the written chapter. Report ONLY these violations: (a) a MAJOR outline beat missing from the chapter (type `missing_beat`) — but a beat the AUTHOR INSTRUCTIONS declared removed is NOT missing, so do not flag it; (b) a major beat, plot turn, or character present in the chapter but absent from the outline (type `invented_beat`); (c) naming inconsistency against the glossary or world notes (type `naming`); (d) leftover nationalism, discrimination, or references to real-world countries/cultures (types `nationalism`, `discrimination`, `real_world_reference`).\n\n' +
  'Do NOT critique prose quality, pacing, word choice, or style — the re-author owns those, and flagging them causes pointless repair churn. Count how many outline beats are present as `coveredBeats` out of `totalBeats`, and list any absent beats in `missingBeats`. When none of the above is violated, the verdict is clean and issues is empty.\n\n' +
  'Respond with ONLY one valid JSON object — nothing outside the JSON, no markdown fences — of exactly this shape:\n' +
  '{"verdict": "clean|issues", "coveredBeats": number, "totalBeats": number, "missingBeats": [string], "issues": [{"type": "missing_beat|invented_beat|naming|nationalism|discrimination|real_world_reference", "detail": string, "excerpt": string}]}';

export const reforgeJudgePrompt: PromptModule<ReforgeJudgeOutput> = {
  key: 'reforge-judge',
  version: '1.0.0',
  kind: 'analytical',
  role: 'judge',
  system,
  template: ChatPromptTemplate.fromMessages([
    new SystemMessage(system),
    ['human', 'Outline:\n{outline}\n\nWorld notes:\n{worldNotes}\n\nGlossary slice:\n{glossarySlice}'],
    ['human', 'Written chapter:\n{writtenProse}'],
  ]),
  schema: ReforgeJudgeSchema,
  postValidate: data => {
    const errors: string[] = [];
    if (data.verdict === 'issues' && data.issues.length === 0) errors.push('verdict "issues" requires at least one issue');
    if (data.verdict === 'clean' && data.issues.length > 0) errors.push('verdict "clean" must have an empty issues list');
    if (data.coveredBeats > data.totalBeats) errors.push('coveredBeats cannot exceed totalBeats');
    return errors;
  },
};
