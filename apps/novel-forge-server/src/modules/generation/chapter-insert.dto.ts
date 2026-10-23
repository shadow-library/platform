import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { BriefResponse } from './generation.dto';

@Schema()
export class ChapterInsertParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field(() => Integer, { minimum: 0, description: 'Insert the new chapter immediately after this number; 0 inserts ahead of chapter 1.' })
  afterChapter: number;
}

@Schema()
export class InsertChapterBody {
  @Field(() => String, { enum: ['hand', 'planner'], description: "'hand' takes briefBody verbatim; 'planner' drafts the brief from intent." })
  briefOrigin: 'hand' | 'planner';

  @Field({ optional: true, description: "The brief body to store verbatim. Required when briefOrigin is 'hand'." })
  briefBody?: string;

  @Field({ optional: true, description: "One line describing what the inserted chapter must do. Required when briefOrigin is 'planner'." })
  intent?: string;
}

@Schema({ description: 'The brief created in the freed slot, plus the extent of the renumber that freed it.' })
export class InsertChapterResponse {
  @Field(() => BriefResponse)
  brief: BriefResponse;

  @Field(() => Integer, { description: 'Number the inserted chapter now occupies.' })
  newChapter: number;

  @Field(() => Integer, { description: 'How many briefs the insert renumbered.' })
  shiftedChapters: number;
}
