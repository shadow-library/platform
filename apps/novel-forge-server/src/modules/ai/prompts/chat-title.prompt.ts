import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type ChatTitleOutput, ChatTitleSchema } from '../schemas/chat-title.schema';
import { type PromptModule } from './types';

const system =
  'You name a chat conversation from the author\'s opening message alone — there is no reply yet, so name only what this message asks for, never what the reply might say. Give it a short title: 2–6 words for what the author is trying to DO in this conversation — the task, the question, the decision — not what the novel is about. "Kaela\'s contradicted vow", "Volume 2 pacing", "Briefs for chapters 40-45" are titles; a title that would sit unchanged on any other conversation in this novel has failed, because it named the setting instead of the ask. Use only what the message says — never invent a character, place, or plot detail it does not mention. If the message is a bare instruction with no story content — "fix this", "regenerate chapter 12", "undo that" — name the action itself, not a guessed subject. If it is long, rambling, or raises several things at once, title it for the one ask that matters most; do not try to cover all of them. No quotation marks, no trailing punctuation, no "Chat about…" or "Request to…" preamble.\n\n' +
  'Respond with ONLY one valid JSON object — nothing outside the JSON, no markdown fences — of exactly this shape: {"title": "..."}';

export const chatTitlePrompt: PromptModule<ChatTitleOutput> = {
  key: 'chat-title',
  version: '1.0.0',
  kind: 'analytical',
  role: 'title',
  system,
  template: ChatPromptTemplate.fromMessages([new SystemMessage(system), ['human', "The author's opening message:\n{message}"]]),
  schema: ChatTitleSchema,
};
