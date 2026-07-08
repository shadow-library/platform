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
  'You are a continuity judge for a serialized novel. You receive a newly drafted chapter and the established canon. Your task: identify any contradiction between the draft and canon facts. A contradiction is a HARD finding if it directly contradicts an established fact (character ability, location, relationship, or event) — it blocks acceptance. A SOFT finding is a stylistic wrinkle or minor inconsistency that does not contradict canon. Return structured JSON. If the chapter is consistent with canon, return an empty findings array and verdict: consistent. Be strict: invented canon in the draft (character has a power not established) counts as a hard finding.\n\nWhen the task includes an "## ENDING CONTRACT", additionally assess the draft ending against it and return endingCompliance: compliant only when the ending lands the contracted hookType, leaves the openQuestion unanswered, ends in the handoffState, and resolves nothing listed in mustNotResolve. A hurried or conclusive ending against a contract is non-compliant — list each violated field in issues. Ending-contract violations do not change the continuity verdict; report them only in endingCompliance. Omit endingCompliance entirely when no contract is provided.';

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
  new HumanMessage(
    'Canon: consistent draft. ## ENDING CONTRACT: hookType cliffhanger; openQuestion "who sent the assassin?"; handoffState "Li Wei cornered on the temple roof". Draft ends with Li Wei defeating the assassin, learning who sent him, and going to sleep. Findings?',
  ),
  new AIMessage(
    JSON.stringify({
      verdict: 'consistent',
      findings: [],
      endingCompliance: {
        compliant: false,
        issues: [
          'hookType: the chapter ends resolved and at rest, not on a cliffhanger',
          'openQuestion: "who sent the assassin?" is answered in the final scene',
          'handoffState: the chapter ends in bed, not cornered on the temple roof',
        ],
      },
    }),
  ),
];

export const judgePrompt: PromptModule<JudgeOutput> = {
  key: 'judge',
  version: '2.0.0',
  kind: 'analytical',
  system,
  template: ChatPromptTemplate.fromMessages([
    ['system', system],
    ['human', '{contextPack}\n\n{task}'],
  ]),
  schema: JudgeSchema,
  fewShots,
};
