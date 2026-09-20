import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type BibleStageOutput, BibleStageSchema } from '../../schemas/new-novel.schema';
import { AUTHORING_STYLE_PLANNING, BIBLE_STAGE_OUTPUT_SHAPE } from '../authoring-preamble';
import { type PromptModule } from '../types';
import { renderStageContract, validateStageCoverage } from './stage-contract';

const system = `${AUTHORING_STYLE_PLANNING}\n\nGenerate the power-system bible document. Cover three things and name each explicitly: the progression ladder readers anticipate and argue about (its rungs, in order, and what changes at each), what power costs and what it cannot do, and what happens when its rules are broken. Contradictions in a power system are the most expensive bugs a serial can ship — be precise, and prefer a hard limit over an impressive one. A chapter author must finish this knowing exactly what a character at a given rung can and cannot attempt.\n\nAlso emit \`worldFacts\` entries for the atomic rules — a rung's threshold, a cost, a forbidden application — using \`category\` to group them (for example \`power_system\`, \`progression\`, \`limits\`), \`key\` as a short stable identifier, and \`value\` as the single concrete rule.\n\n${renderStageContract('power')}\n\n${BIBLE_STAGE_OUTPUT_SHAPE}`;

export const powerPrompt: PromptModule<BibleStageOutput> = {
  key: 'bible:power',
  version: '1.0.0',
  kind: 'authoring',
  role: 'bible',
  system,
  template: ChatPromptTemplate.fromMessages([new SystemMessage(system), ['human', 'Foundation:\n{foundation}\nSetting:\n{world}\n\nProject brief:\n{projectBrief}']]),
  schema: BibleStageSchema,
  postValidate: data => validateStageCoverage('power', data),
};
