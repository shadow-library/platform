import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

@Schema()
export class NotesProjectParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class SaveMessageAsNotesBody {
  // A pattern, not `format: 'uuid'` — fastify's route schema compiler has no uuid format registered.
  @Field({ pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', description: 'The chat the message was sent in.' })
  sessionId: string;

  @Field({ pattern: '^[0-9]+$', description: 'One of the author’s own messages in that chat, of at least 600 words.' })
  messageId: string;
}

@Schema()
export class SavedNotesResponse {
  @Field({ description: 'False when the notes already held the message, so nothing changed.' })
  saved: boolean;

  @Field(() => Integer, { description: 'Paragraphs in the notes now, numbered as organising and the chat’s notes lookup number them.' })
  paragraphs: number;

  @Field(() => Integer)
  words: number;
}
