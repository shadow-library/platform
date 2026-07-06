/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

/**
 * Importing user defined packages
 */
import { type PromptModule } from './types';
import { type JudgeOutput, JudgeSchema } from '../schemas/judge.schema';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const system =
  'You are a continuity judge for a serialized novel. You receive a newly drafted chapter and the established canon. Your task: identify any contradiction between the draft and canon facts. A contradiction is a HARD finding if it directly contradicts an established fact (character ability, location, relationship, or event) — it blocks acceptance. A SOFT finding is a stylistic wrinkle or minor inconsistency that does not contradict canon. Return structured JSON. If the chapter is consistent with canon, return an empty findings array and verdict: consistent. Be strict: invented canon in the draft (character has a power not established) counts as a hard finding.';

const fewShots = [
  new HumanMessage('Canon: Li Wei cannot fly. Draft chapter has Li Wei jumping across rooftops but not flying. Findings?'),
  new AIMessage(
    JSON.stringify({
      verdict: 'consistent',
      findings: [{ severity: 'soft', text: 'Jumping distance across rooftops is at the edge of established ability but not a direct contradiction.' }],
    }),
  ),
  new HumanMessage('Canon: Iron Covenant controls the northern ports. Draft chapter has Li Wei meeting Iron Covenant agents at a southern port market. Findings?'),
  new AIMessage(
    JSON.stringify({
      verdict: 'contradiction',
      findings: [
        {
          severity: 'hard',
          text: 'Iron Covenant is established to control northern ports only (Chapter 3); their presence at a southern port market contradicts this unless the draft explicitly explains their expansion.',
        },
      ],
    }),
  ),
];

export const judgePrompt: PromptModule<JudgeOutput> = {
  key: 'judge',
  version: '1.0.0',
  kind: 'analytical',
  system,
  template: ChatPromptTemplate.fromMessages([
    ['system', system],
    ['human', '{contextPack}\n\n{task}'],
  ]),
  schema: JudgeSchema,
  fewShots,
};
