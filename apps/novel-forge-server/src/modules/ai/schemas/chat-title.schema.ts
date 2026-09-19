import { Field, Schema } from '@shadow-library/class-schema';

export const CHAT_TITLE_MAX_LENGTH = 60;

@Schema()
export class ChatTitleSchema {
  @Field({
    minLength: 1,
    maxLength: CHAT_TITLE_MAX_LENGTH,
    description: '2–6 words naming what the author is trying to do in this conversation — not the story, no quotes, no trailing punctuation',
  })
  title: string;
}

export type ChatTitleOutput = ChatTitleSchema;
