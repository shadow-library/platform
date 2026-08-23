import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type ReforgeTransformJudgeOutput, ReforgeTransformJudgeSchema, validateTransformJudge } from '../schemas/reforge-transform.schema';
import { type PromptModule } from './types';

const system =
  'You check one chapter of a re-authored novel against the plan its author approved. You measure the CONTRACT, nothing else, and you report exactly four kinds of fault.\n\n' +
  '1. `missing_kept_beat` — a beat listed in KEPT BEATS that did not land in the prose. Count the beats that did land in `coveredBeats` out of `totalBeats`.\n' +
  '2. `resurfaced_cut` — material the CUT LEDGER says is gone reappearing: named, alluded to, recapped, or remembered. The deterministic pre-scan below already found every literal alias match; your job on those is to confirm or dismiss them, and to catch the paraphrased resurfacing a string match cannot see.\n' +
  '3. `seam_break` — the chapter contradicts its bridge directive or its continuity notes: it explains away the gap, resumes something the bridge says was abandoned, or opens in a state the plan says is no longer true.\n' +
  '4. Naming and real-world residue — a source name the glossary maps left unconverted, or a real country, nationality, or culture referenced.\n\n' +
  'CONDENSATION IS NOT DRIFT. This chapter is deliberately shorter than the source it was written from, and material present in the source but absent from KEPT BEATS is outside the contract: it was cut on purpose. Never report it. Never report a beat as invented — the plan, not the source, defines what belongs here.\n\n' +
  'You are FORBIDDEN from judging prose quality, pacing, word choice, or style. Those are not faults and reporting them causes repair passes that make the chapter worse.\n\n' +
  'Respond with ONLY one valid JSON object — nothing outside the JSON, no markdown fences — of exactly this shape:\n' +
  '{"verdict": "clean|issues", "coveredBeats": number, "totalBeats": number, "missingBeats": [string], ' +
  '"issues": [{"type": "missing_kept_beat|resurfaced_cut|seam_break|naming|nationalism|discrimination|real_world_reference", "detail": string, "excerpt": string}]}';

export const reforgeTransformJudgePrompt: PromptModule<ReforgeTransformJudgeOutput> = {
  key: 'reforge-transform-judge',
  version: '1.0.0',
  kind: 'analytical',
  role: 'judge',
  system,
  template: ChatPromptTemplate.fromMessages([
    new SystemMessage(system),
    [
      'human',
      'KEPT BEATS:\n{keptBeats}\n\nCONTINUITY NOTES:\n{continuityNotes}\n\nBRIDGE:\n{bridge}\n\nCUT LEDGER:\n{cutLedger}\n\nWORLD NOTES:\n{worldNotes}\n\nGLOSSARY:\n{glossarySlice}\n\nPre-scanned alias hits:\n{scanHits}',
    ],
    ['human', 'Written chapter:\n{writtenProse}'],
  ]),
  schema: ReforgeTransformJudgeSchema,
  postValidate: validateTransformJudge,
};
