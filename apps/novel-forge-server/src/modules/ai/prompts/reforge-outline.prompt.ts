import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type ReforgeOutlineOutput, ReforgeOutlineSchema } from '../schemas/reforge.schema';
import { type PromptModule } from './types';

const system =
  'You read one chapter of a translated Chinese web novel and distil it into a faithful, ordered outline that a re-author will write from. This outline is the fidelity contract: every downstream check measures the re-authored chapter against it, so it must capture what the source chapter actually does — not what it could be. Do not invent beats, do not drop beats, do not reorder them.\n\n' +
  'Follow the WORLD NOTES and GLOSSARY: render every mapped source name as its replacement and coin new names in the same style, so the outline already speaks in the alternate world. Never keep pinyin, real countries, or real cultures.\n\n' +
  'Break the chapter into its scenes/beats in reading order. For each beat capture: a `summary` of what happens, its `purpose` (why it matters to the story), the participating `entities` (renamed), the `emotionalTurn` it lands, and the `dialogueAnchors` — the key lines captured by MEANING, never transcribed word-for-word. Also give a one- or two-sentence `throughline` for the whole chapter.\n\n' +
  'Respond with ONLY one valid JSON object — nothing outside the JSON, no markdown fences — of exactly this shape:\n' +
  '{"title": string, "throughline": string, "beats": [{"summary": string, "purpose": string, "entities": [string], "emotionalTurn": string, "dialogueAnchors": [string]}]}';

// System, then the stable pack (world notes) in the first human message, volatile source prose last —
// same cache-order convention as the rebrand prompts (refinement design §10.2).
export const reforgeOutlinePrompt: PromptModule<ReforgeOutlineOutput> = {
  key: 'reforge-outline',
  version: '1.0.0',
  kind: 'analytical',
  role: 'reforge',
  system,
  template: ChatPromptTemplate.fromMessages([new SystemMessage(system), ['human', '{contextPack}'], ['human', 'Source chapter to outline:\n{chapterProse}']]),
  schema: ReforgeOutlineSchema,
};
