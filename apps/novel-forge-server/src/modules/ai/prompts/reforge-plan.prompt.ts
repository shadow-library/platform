import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

// Direct file import of a DI-free pure validator — never the reforge barrel, whose service imports the AI module.
import { validateTransformPlan } from '../../reforge/plan-validation';
import { type ReforgePlanOutput, ReforgePlanSchema } from '../schemas/reforge-transform.schema';
import { type PromptModule } from './types';

const system =
  'You are a structural editor turning an analysis of a long serialized novel into a transformation plan: which stretches of the source survive as they are, which are condensed, which are merged into a single chapter, and which go entirely. A human author reads and edits your plan before a word is written, so it must be legible and argued, not merely valid.\n\n' +
  'Cover EVERY source chapter exactly once. The spans run in reading order with no gaps and no overlaps, and each carries an `action` and a `targetChapters`: `keep` produces exactly as many output chapters as it has source chapters; `merge` produces exactly 1; `condense` produces at least 1 and fewer than its length; `drop` produces 0. A chapter that is going away is covered by a `drop` span — never by a gap. The first span can never be a drop, because a novel needs an opening.\n\n' +
  'Cut what the analysis shows to be dead weight: filler runs, repeated scene patterns, stretches where the story stops moving, subplots the original author abandoned. Keep what works, and prefer condensing a flawed arc to dropping it when it carries a payoff the rest of the book depends on. Respect the target compression the author asked for as a whole-novel ratio, not a per-span rule.\n\n' +
  'For every span that produces output, `keptBeats` lists what its output chapters owe the reader — this is the contract the fidelity check measures against, so a beat you leave out is a beat that will be legitimately absent. `cutThreads` names what this span removes, and every entry becomes a permanent ledger entry that no later chapter may resurface. Where a drop or a condense leaves a seam, the FOLLOWING span carries `continuityNotes` saying what must be true when it opens — time passed, what the reader last saw, which set-ups now have to be paid elsewhere or explicitly abandoned. A span that follows a drop without continuity notes is invalid.\n\n' +
  'Never write more source chapters into a single output chapter than the ceiling the plan brief states — a span that would need to must produce more output chapters. Argue each decision in `rationale`, and cite the analysis findings that justify it in `findingIds`.\n\n' +
  'Respond with ONLY one valid JSON object — nothing outside the JSON, no markdown fences — of exactly this shape:\n' +
  '{"summary": string, "spans": [{"ordinal": number, "fromChapter": number, "toChapter": number, "action": "keep|condense|merge|drop", "targetChapters": number, "arcLabel": string, "rationale": string, "keptBeats": [string], "cutThreads": [string], "continuityNotes": string, "findingIds": [string]}]}';

// The plan is drawn from the persisted report, not from prose: the analysis is the whole novel already
// read once, and re-reading it here would buy nothing but a 300k-token haystack (transform design §3.2).
export const reforgePlanPrompt: PromptModule<ReforgePlanOutput> = {
  key: 'reforge-plan',
  version: '1.0.0',
  kind: 'analytical',
  role: 'plan',
  cacheStrategy: { stableVars: ['stableContext'] },
  system,
  template: ChatPromptTemplate.fromMessages([
    new SystemMessage(system),
    ['human', '{stableContext}'],
    ['human', 'Analysis report:\n{report}\n\nChapter cards:\n{cardIndex}\n\n{planBrief}'],
  ]),
  schema: ReforgePlanSchema,
  // The source chapter count is checked server-side; here the repair ladder only has the draft itself.
  postValidate: data => validateTransformPlan(data.spans),
};
