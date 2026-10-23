import { EnumType, Field, Integer, Schema } from '@shadow-library/class-schema';

import { DraftRevisionSource } from '@server/common';
import { type Ai } from '@server/database';

import { DraftSaveBase } from './generation.dto';

const DiffOp = EnumType.create('DiffOp', ['equal', 'insert', 'delete']);

@Schema()
export class CompareVersionsQuery {
  @Field(() => Integer, { minimum: 0, description: 'The older revision; the diff reads from it.' })
  from: number;

  @Field(() => Integer, { minimum: 0, description: 'The newer revision; the diff reads to it.' })
  to: number;
}

@Schema()
export class RestoreVersionBody extends DraftSaveBase {}

@Schema({ description: "One stored version of a chapter's draft and its cause." })
class DraftVersionResponse {
  @Field(() => Integer)
  revision: number;

  @Field(() => DraftRevisionSource, { nullable: true, description: 'What made this version; null for current text written before history was kept.' })
  source: Ai.DraftRevisionSource | null;

  @Field(() => Integer, { nullable: true, description: 'Set on a `restored` version: the revision it brought back.' })
  restoredFrom: number | null;

  @Field()
  current: boolean;

  @Field({ description: 'The revision the author last approved.' })
  approved: boolean;

  @Field({ description: "The version's prose was isolated (an unrestricted chapter) when it was written; restoring it keeps the draft isolated." })
  isolated: boolean;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;
}

@Schema()
export class ListDraftVersionResponse {
  @Field(() => [DraftVersionResponse], {
    description:
      'Newest first. History is bounded: the newest 50 revisions and the approved one are kept. Restore is refused on a final chapter (VER_002), and restoring the approved revision still needs approving again.',
  })
  items: DraftVersionResponse[];
}

@Schema({ description: 'A run of text that is unchanged, added or removed; concatenating `equal` and `delete` gives the older text, `equal` and `insert` the newer.' })
class DiffHunkResponse {
  @Field(() => DiffOp)
  op: 'equal' | 'insert' | 'delete';

  @Field()
  text: string;
}

@Schema()
export class VersionComparisonResponse {
  @Field(() => Integer)
  from: number;

  @Field(() => Integer)
  to: number;

  @Field(() => [DiffHunkResponse], { description: 'Paragraph-then-word diff, in reading order.' })
  hunks: DiffHunkResponse[];

  @Field(() => Integer)
  wordsAdded: number;

  @Field(() => Integer)
  wordsRemoved: number;
}
