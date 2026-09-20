import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type BibleStageOutput, BibleStageSchema } from '../../schemas/new-novel.schema';
import { AUTHORING_STYLE_PLANNING, BIBLE_STAGE_OUTPUT_SHAPE } from '../authoring-preamble';
import { type PromptModule } from '../types';
import { renderStageContract, validateStageCoverage } from './stage-contract';

const system = `${AUTHORING_STYLE_PLANNING}\n\nGenerate the setting bible document. Cover: the era and place the story lives in, the rules of ordinary life (who holds power, how people earn a living, what an average day costs), and the geopolitical shape that makes this plot possible rather than a different one. Describe only what bears on the story — a chapter author should finish this able to stage a scene anywhere you named. Leave the power system itself to the power document; name it here only where daily life bends around it.\n\nAlso emit \`worldFacts\` entries — atomic category/key/value facts a chapter author or a deterministic check can look up without re-reading prose. Use \`category\` to group them (\`geography\`, \`politics\`, \`economy\`, \`society\` are examples, not a fixed list), \`key\` as a short stable identifier, and \`value\` as one concrete fact specific enough to settle a continuity question on its own.\n\n${renderStageContract('world')}\n\n${BIBLE_STAGE_OUTPUT_SHAPE}`;

export const worldPrompt: PromptModule<BibleStageOutput> = {
  key: 'bible:world',
  version: '1.0.0',
  kind: 'authoring',
  role: 'bible',
  system,
  template: ChatPromptTemplate.fromMessages([new SystemMessage(system), ['human', 'Foundation:\n{foundation}\n\nProject brief:\n{projectBrief}']]),
  schema: BibleStageSchema,
  postValidate: data => validateStageCoverage('world', data),
};
