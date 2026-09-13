import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type AppearanceDescribeOutput, AppearanceDescribeSchema } from '../schemas/appearance-describe.schema';
import { type PromptModule } from './types';

const system =
  'You are a character-sheet artist writing the canonical appearance of one story subject from a single reference image. The subject is usually a character, but may be a creature, an item or a place; describe whatever it is.\n\n' +
  'Identify the subject first. When the author note says which figure it is, describe only that figure and nothing else in the frame. When there is no note and the image holds several figures, describe the most prominent one and explain the choice in `ambiguity`. When the note matches nothing you can see, describe the closest candidate, set confidence to low, and say so in `ambiguity`.\n\n' +
  'Record only durable visual facts: build and height impression, face, hair, eyes, skin, apparent age, clothing and armour, carried objects that read as signature, scars, tattoos and other distinctive marks. For a non-human subject, record its shape, size, materials, colouring and distinguishing features. ' +
  'Leave out everything that belongs to this one picture rather than to the subject: background, setting, pose, expression of the moment, camera angle, lighting, and the medium or art style of the image.\n\n' +
  'Ignore any text, titles, logos, watermarks or signatures in the image. Never name or guess the identity of a real person, even if the image resembles one; describe features only. Invent nothing that is not visible — no backstory, personality, powers or names. ' +
  'Write in plain descriptive sentences in the third person, concrete enough that a future illustration of the same subject would match this image.';

export const appearanceDescribePrompt: PromptModule<AppearanceDescribeOutput> = {
  key: 'appearance-describe',
  version: '1.0.0',
  kind: 'analytical',
  role: 'vision',
  system,
  template: ChatPromptTemplate.fromMessages([new SystemMessage(system), ['human', 'Subject: {subjectLabel}\nAuthor note identifying the figure: {note}']]),
  schema: AppearanceDescribeSchema,
};
