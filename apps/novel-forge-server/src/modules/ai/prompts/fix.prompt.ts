/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

/**
 * Importing user defined packages
 */
import { AUTHORING_STYLE } from './authoring-preamble';
import { type PromptModule } from './types';
import { type FixOutput, FixSchema } from '../schemas/fix.schema';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const system = `${AUTHORING_STYLE}\n\nYou are a surgical editor tasked with repairing continuity contradictions in a chapter draft. You receive the draft, the judge's findings (with [HARD] severity markers), and the established canon. Choose: PATCH if the contradiction can be fixed with targeted find/replace operations (preferred — minimize disruption). REWRITE if the contradiction is structural and patches cannot fix it. For patches: find strings must be unique and verbatim; replace text must preserve prose style. Minimal intervention only — do not rewrite sections that are not contradicted.

Respond with ONLY one valid JSON object — nothing outside the JSON, no markdown fences — of exactly this shape:
{"action": "patch" or "rewrite", "patches": [{"find": "...", "replace": "..."}] (patch only), "body": "..." (rewrite only)}`;

const fewShots = [
  new HumanMessage(
    'Hard finding: Li Wei uses the Void Step technique in paragraph 3, but Void Step was not unlocked until Chapter 15 (this is Chapter 12). Draft paragraph: "With practiced ease, Li Wei executed the Void Step, vanishing from sight."',
  ),
  new AIMessage(
    JSON.stringify({
      action: 'patch',
      patches: [
        { find: 'Li Wei executed the Void Step, vanishing from sight', replace: 'Li Wei launched into a burst of footwork, weaving between the guards with trained precision' },
      ],
    }),
  ),
];

export const fixPrompt: PromptModule<FixOutput> = {
  key: 'fix',
  version: '1.1.0',
  kind: 'authoring',
  system,
  // Few-shots ride inside the template — a fewShots field the router never injects teaches nothing.
  template: ChatPromptTemplate.fromMessages([new SystemMessage(system), ...fewShots, ['human', '{contextPack}\n\n{task}']]),
  schema: FixSchema,
  fewShots,
};
