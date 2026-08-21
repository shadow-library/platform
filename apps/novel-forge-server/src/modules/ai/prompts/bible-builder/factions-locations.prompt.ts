import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type BibleStageOutput, BibleStageSchema } from '../../schemas/new-novel.schema';
import { AUTHORING_STYLE_PLANNING, BIBLE_STAGE_OUTPUT_SHAPE } from '../authoring-preamble';
import { type PromptModule } from '../types';

const system = `${AUTHORING_STYLE_PLANNING}\n\nGenerate the factions and locations bible document. For each major faction: its goals, methods, internal structure, and relationship to the protagonist and antagonist forces. For each major location: what it looks, sounds, and feels like, why it matters to the plot, and who controls it. Include only factions and locations that will appear in the story.\n\n${BIBLE_STAGE_OUTPUT_SHAPE}`;

export const factionsLocationsPrompt: PromptModule<BibleStageOutput> = {
  key: 'bible:factions-locations',
  version: '1.1.0',
  kind: 'authoring',
  role: 'bible',
  system,
  template: ChatPromptTemplate.fromMessages([
    new SystemMessage(system),
    ['human', 'Foundation:\n{foundation}\nWorld and power:\n{worldAndPower}\n\nProject brief:\n{projectBrief}'],
  ]),
  schema: BibleStageSchema,
};
