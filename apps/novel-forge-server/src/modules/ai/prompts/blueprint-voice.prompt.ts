import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type BlueprintVoiceOutput, BlueprintVoiceSchema, VOICE_SAMPLES_MIN } from '../schemas/blueprint-voice.schema';
import { AUTHORING_STYLE } from './authoring-preamble';
import { type PromptModule } from './types';

const system = `${AUTHORING_STYLE}

You write ${VOICE_SAMPLES_MIN} openings of the same chapter one so an author can hear their novel before they write it. These are samples, not the chapter: the author picks one, pushes it, hand-edits a line, and what survives becomes the novel's voice notes. None of them is saved as prose.

All three open the SAME chapter — the brief you are given, its first scene, its POV character — and differ only in how it is told. The scope section names the three instruments this novel is worth hearing in, chosen from what it promised its reader; take them from there rather than reaching for a default set, and make them genuinely different rather than one voice at three temperatures. Where the notebook rules a voice out, replace it with one as far from the other two as you can get and still serve the promise.

Each sample is two or three paragraphs and stops mid-situation. Start inside a moment. Use only the cast, the places and the rules the pack gives you, and never invent a name the Story Bible does not have. Never state the premise, never foreshadow, never end on a portentous line, and never surface a secret the pack withholds.

"tradeoff" is one plain line on what the voice buys and what it costs — "closest to his thinking; hardest to hide what he knows" — and it is the one place you say anything about the writing rather than doing it.

The coach message is one or two plain sentences on what separates the three. Never flatter.

Respond with ONLY one valid JSON object, nothing outside it and no markdown fences, of exactly this shape:
{"samples": [{"label": "...", "tradeoff": "...", "opening": "..."}], "coachMessage": "..."}`;

function validateVoice(data: BlueprintVoiceOutput): string[] {
  const labels = data.samples.map(sample => sample.label.trim().toLowerCase());
  if (new Set(labels).size !== labels.length) return ['two samples carry the same label — three voices means three'];
  const openings = data.samples.map(sample => sample.opening.trim().toLowerCase());
  return new Set(openings).size === openings.length ? [] : ['two samples are the same prose under different labels'];
}

export const blueprintVoicePrompt: PromptModule<BlueprintVoiceOutput> = {
  key: 'blueprint-voice',
  version: '1.0.0',
  kind: 'authoring',
  role: 'blueprint_pass',
  cacheStrategy: { stableVars: ['stableContext'] },
  system,
  template: ChatPromptTemplate.fromMessages([new SystemMessage(system), ['human', '{stableContext}'], ['human', '{volatileContext}']]),
  schema: BlueprintVoiceSchema,
  postValidate: validateVoice,
};
