import { Field, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { ContentMode, CostTier, ProgressItemKey, ProgressItemStatus, type ProgressOverrideKind, ProgressOverrideStatus, type ProgressStatus } from '@server/common';
import { type Project } from '@server/database';

export const NOTES_MAX_CHARS = 100_000;

const NOTES_DESCRIPTION = "The author's own words about the novel, kept verbatim and read by the chat as the author's notes. Up to 10,000 words.";

@Schema()
export class NewNovelProjectParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class ProgressKeyParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field(() => ProgressItemKey)
  key: string;
}

@Schema()
export class CreateNovelWithNotesBody {
  @Field({ minLength: 1, maxLength: 255, description: 'The working title.' })
  title: string;

  @Field({ optional: true, maxLength: NOTES_MAX_CHARS, description: NOTES_DESCRIPTION })
  notes?: string;

  @Field(() => ContentMode, { optional: true })
  contentMode?: Project.ContentMode;

  @Field(() => CostTier, { optional: true, description: 'The cost tier AI work on the new project runs at; omitted uses your default cost tier for new projects.' })
  costTier?: Project.CostTier;
}

@Schema()
export class CreateNovelWithNotesResponse {
  @Field(() => String)
  projectId: bigint;

  @Field({ description: 'The chat session created in auto mode, ready for a pending first turn.' })
  sessionId: string;
}

@Schema()
export class UpdateNotesBody {
  @Field({ maxLength: NOTES_MAX_CHARS, description: `${NOTES_DESCRIPTION} A blank value clears them.` })
  notes: string;
}

@Schema()
export class NotesResponse {
  @Field({ description: "The author's current notes; empty when none have been stored." })
  notes: string;

  @Field(() => String, { optional: true, description: 'The ledger entry backing the notes; absent when there are none yet.' })
  entryId?: bigint;

  @Field(() => String, { optional: true, format: 'date-time', description: 'When the current notes were last written.' })
  updatedAt?: Date;
}

@Schema()
export class ProgressOverrideBody {
  @Field(() => ProgressOverrideStatus, {
    description: "'undecided' answers the item as settled with no value; 'dismissed' hides it from the checklist. Both persist until cleared.",
  })
  status: ProgressOverrideKind;
}

@Schema()
export class ProgressItemResponse {
  @Field()
  key: string;

  @Field()
  label: string;

  @Field()
  why: string;

  @Field(() => ProgressItemStatus)
  status: ProgressStatus;

  @Field(() => String, { optional: true, description: 'The ledger entry backing an `undecided`/`dismissed` status; present only then.' })
  overrideEntryId?: bigint;
}

@Schema()
export class ProgressResponse {
  @Field(() => [ProgressItemResponse])
  items: ProgressItemResponse[];
}
