import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type BibleStageOutput, BibleStageSchema } from '../../schemas/new-novel.schema';
import { AUTHORING_STYLE_PLANNING, BIBLE_STAGE_OUTPUT_SHAPE } from '../authoring-preamble';
import { type PromptModule } from '../types';

const system = `${AUTHORING_STYLE_PLANNING}\n\nGenerate the world and power system bible document. Cover: the geography and geopolitical structure (only what matters to the plot), the power system (rules, costs, limits, and how it affects society), and the magic/technology ecosystem. Be specific enough that a chapter author knows exactly what characters can and cannot do. Contradictions in the power system are the most expensive bugs to fix — be precise.\n\nAlso emit \`worldFacts\` entries — structured category/key/value facts extracted from the same content, not a restatement of the prose but the atomic rules a deterministic system or chapter author can look up without re-parsing paragraphs. Use \`category\` to group related facts (e.g. \`geography\`, \`power_system\`, \`technology\`, \`politics\` — pick whatever categories fit this world, these are only examples), \`key\` as a short stable identifier within that category (e.g. \`capital_city\`, \`cost_of_casting\`, \`faster_than_light_travel\`), and \`value\` as the single concrete fact or rule (a limit, a cost, a location, a boundary, a name) — specific enough to settle a continuity question on its own. Set \`chapter\` only when the fact is scoped to take effect from, or be revealed at, a specific chapter.\n\n${BIBLE_STAGE_OUTPUT_SHAPE}`;

export const worldPowerPrompt: PromptModule<BibleStageOutput> = {
  key: 'bible:world-power',
  version: '1.2.0',
  kind: 'authoring',
  role: 'bible',
  system,
  template: ChatPromptTemplate.fromMessages([new SystemMessage(system), ['human', 'Foundation:\n{foundation}\n\nProject brief:\n{projectBrief}']]),
  schema: BibleStageSchema,
};
