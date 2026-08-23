import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type ReforgeSynthesizeOutput, ReforgeSynthesizeSchema, validateArcOrder } from '../schemas/reforge-transform.schema';
import { type PromptModule } from './types';

const system =
  'You are a structural editor who has read a whole serialized novel as chapter cards — one card per chapter, each recording what happens, who is in it, what it opens and closes, and whether the story moved. You now write the global view no single reading window could see.\n\n' +
  'Report the ARCS: contiguous, non-overlapping chapter ranges with a label a person would recognise, and a line on whether each arc earns the length it takes. Then the FINDINGS only visible across the whole book — a scene pattern repeated in arcs hundreds of chapters apart, a subplot the author abandoned (name the chapter it was abandoned at), a stretch where the story stops moving, an arc that could go entirely. DETERMINISTIC SIGNALS lists mechanically-found candidates; confirm or reject them and cite the id in `signalRef` rather than rediscovering them.\n\n' +
  'The `summary` is the report an author reads before deciding what their novel should become: what this book is, what works, what is dead weight, and roughly what it would look like cut down. Be concrete and name chapters. `pacingProfile` says how the pacing behaves from opening to end.\n\n' +
  'Judge SHAPE only. Say nothing about prose quality, word choice, or translation, and do not propose a plan — the author decides what is cut, from what you report here.\n\n' +
  'The SCOPE line says which part of the novel these cards cover. When it names a chapter range rather than the whole novel, keep every finding inside it and expect your output to be merged with the neighbouring ranges.\n\n' +
  'Respond with ONLY one valid JSON object — nothing outside the JSON, no markdown fences — of exactly this shape:\n' +
  '{"summary": string, "pacingProfile": string, "arcs": [{"fromChapter": number, "toChapter": number, "label": string, "rationale": string}], ' +
  '"findings": [{"type": "filler|repetition|pacing_stall|dead_subplot|dropped_thread|arc_boundary|quality_outlier", "fromChapter": number, "toChapter": number, "severity": number, "confidence": number, "label": string, "detail": string, "signalRef": string}]}';

// Two-level synthesis (transform design §3.3) runs this same prompt over card slices and then over the
// resulting rollups; `scope` is what tells the model which of the two it is doing.
export const reforgeSynthesizePrompt: PromptModule<ReforgeSynthesizeOutput> = {
  key: 'reforge-synthesize',
  version: '1.0.0',
  kind: 'analytical',
  role: 'extraction',
  cacheStrategy: { stableVars: ['stableContext'] },
  system,
  template: ChatPromptTemplate.fromMessages([
    new SystemMessage(system),
    ['human', '{stableContext}'],
    ['human', '{volatileContext}\n\nSCOPE: {scope}\n\nChapter cards:\n{cardIndex}'],
  ]),
  schema: ReforgeSynthesizeSchema,
  postValidate: validateArcOrder,
};
