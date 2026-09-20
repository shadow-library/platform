import { Field, Integer, Schema, SchemaComposer } from '@shadow-library/class-schema';

import { type Ideation } from '@server/database';

import { ConceptCardResponse, ReadinessEntryResponse } from './ideation.dto';
import { getQuestion } from './question-bank';

@Schema({ description: 'One question the studio is asking this turn.' })
export class StudioQuestionResponse {
  @Field({ description: 'The question id the round handed over; the sheet records it as asked under this id.' })
  id: string;

  @Field({ description: 'The question as asked, in full — the prose reply never repeats it.' })
  wording: string;

  @Field({ description: 'Reviewed prose shown under the question; rendered as-is.' })
  coaching: string;

  @Field(() => [String], { description: 'Concrete answers the author can tap; tapping one sends it as the next turn.' })
  options: string[];

  @Field({ description: 'The commit-and-explain escape hatch: the answer the studio would pick, and why.' })
  youDecide: string;

  @Field(() => String, {
    enum: ['one', 'many'],
    description:
      "Whether the author can hold only one of the options at a time, or several at once. 'one' renders as radio buttons, 'many' as checkboxes; 'many' also makes \"You decide\" mutually exclusive with picking any option.",
  })
  select: 'one' | 'many';
}

@Schema({ description: 'A decision inferred from material the author supplied, offered back for confirmation before anything is written to the sheet.' })
export class StudioLockResponse {
  @Field()
  key: string;

  @Field(() => String, { enum: ['shape', 'scope', 'promise'] })
  kind: Ideation.ConstraintKind;

  @Field({ description: 'The decision as one falsifiable rule the plan can be checked against.' })
  text: string;
}

@Schema({ description: 'An interview turn: what to ask next, plus anything the turn inferred from the author’s own words.' })
export class StudioQuestionsPayloadResponse {
  @Field({ const: 'questions' })
  kind: 'questions';

  @Field(() => [StudioQuestionResponse])
  questions: StudioQuestionResponse[];

  @Field(() => [StudioLockResponse], { optional: true, description: 'Absent when the turn inferred nothing.' })
  locks?: StudioLockResponse[];
}

@Schema({ description: 'A concept card shown despite failing a locked playbook filter — author judgement outranks the filter.' })
export class StudioFilterRejectionResponse {
  @Field()
  playbookKey: string;

  @Field({ description: 'Title of the card that failed the filter.' })
  card: string;

  @Field()
  mustReplace: string;
}

@Schema({ description: 'A divergence turn: the concepts generated this round, for the author to keep, kill or cross.' })
export class StudioCardsPayloadResponse {
  @Field({ const: 'cards' })
  kind: 'cards';

  @Field(() => Integer, { description: 'The round these cards were generated in; each card carries its own too.' })
  round: number;

  @Field(() => [ConceptCardResponse])
  cards: ConceptCardResponse[];

  @Field(() => [StudioFilterRejectionResponse], { optional: true, description: 'Absent when every card cleared the locked playbooks.' })
  filtersFailed?: StudioFilterRejectionResponse[];
}

@Schema({ description: 'A stress turn: the critic’s readiness verdict, one row per dimension.' })
export class StudioReadinessPayloadResponse {
  @Field({ const: 'readiness' })
  kind: 'readiness';

  @Field(() => [ReadinessEntryResponse])
  readiness: ReadinessEntryResponse[];
}

export const StudioPayloadResponse = SchemaComposer.discriminator('kind', StudioQuestionsPayloadResponse, StudioCardsPayloadResponse, StudioReadinessPayloadResponse);

export type StudioPayload = StudioQuestionsPayloadResponse | StudioCardsPayloadResponse | StudioReadinessPayloadResponse;

const STUDIO_PAYLOAD_KINDS = new Set<unknown>(['questions', 'cards', 'readiness']);

/**
 * The `chat_messages.payload` column is untyped jsonb, and the response schema is a strict `oneOf` — a row
 * whose `kind` no schema claims makes fast-json-stringify throw and takes the whole transcript with it.
 * Rows written by a newer server and read by an older one are exactly that case, so an unrecognised payload
 * is dropped rather than served: the turn loses its chips, not the conversation.
 */
export function asStudioPayload(payload: Record<string, unknown> | null | undefined): StudioPayload | undefined {
  if (!payload || !STUDIO_PAYLOAD_KINDS.has(payload['kind'])) return undefined;
  if (payload['kind'] === 'questions' && Array.isArray(payload['questions'])) return withBankSelect(payload as unknown as StudioQuestionsPayloadResponse);
  return payload as unknown as StudioPayload;
}

/** Rows written before multi-select existed, and ids the bank has since dropped, were all answered single-select — 'one' is the truth, not a default. */
function withBankSelect(payload: StudioQuestionsPayloadResponse): StudioQuestionsPayloadResponse {
  return { ...payload, questions: payload.questions.map(question => ({ ...question, select: getQuestion(question.id)?.select ?? 'one' })) };
}
