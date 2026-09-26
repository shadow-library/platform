import { EnumType, Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { DraftRevisionSource, PassageSuggestionStatus } from '@server/common';
import { type Ai, type Generation } from '@server/database';

import { DraftResponse, DraftSaveBase } from './generation.dto';
import { MAX_PASSAGE_CHARS } from './passage-anchor';

const PassageFreshness = EnumType.create('PassageFreshness', ['fresh', 'relocated', 'stale']);
const DiffOp = EnumType.create('DiffOp', ['equal', 'insert', 'delete']);

@Schema()
export class SuggestionParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field(() => Integer)
  n: number;

  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  suggestionId: bigint;
}

@Schema()
export class CompareVersionsQuery {
  @Field(() => Integer, { minimum: 0, description: 'The older revision; the diff reads from it.' })
  from: number;

  @Field(() => Integer, { minimum: 0, description: 'The newer revision; the diff reads to it.' })
  to: number;
}

@Schema()
export class PassageRequestBody {
  @Field(() => String, { pattern: '^[0-9]+$', description: 'The id of the draft the passage was selected in.' })
  @Transform('bigint:parse')
  baseDraftId: bigint;

  @Field(() => Integer, { description: 'The draft revision the passage was selected in.' })
  baseRevision: number;

  @Field(() => Integer, { description: 'The draft `saveSeq` the passage was selected in; a draft that has moved since is refused with DRF_013 carrying the current draft.' })
  baseSaveSeq: number;

  @Field(() => Integer, { minimum: 0, description: 'Start of the selection: a UTF-16 code-unit offset into the draft body, as JavaScript string indices count.' })
  start: number;

  @Field(() => Integer, { minimum: 1, description: `End of the selection, exclusive, in the same units as \`start\`; at most ${MAX_PASSAGE_CHARS} characters after it.` })
  end: number;

  @Field({
    pattern: '^[0-9a-f]{64}$',
    description: 'Lowercase hex SHA-256 of the selected text (UTF-8); refused with PSG_003 when the body no longer holds that text at those offsets.',
  })
  passageHash: string;

  @Field({ minLength: 1, maxLength: 2000, description: 'What the author wants changed in the passage — a quick option or free text.' })
  request: string;
}

@Schema({ description: 'Where the anchored passage stands in the draft now. Null offsets when stale.' })
export class PassageLocationResponse {
  @Field(() => PassageFreshness, {
    description:
      '`fresh`: the passage and the 32 characters either side still stand at its anchored offsets. `relocated`: it moved cleanly — text and context occur exactly once, at the offsets given. `stale`: it or the text around it changed, is gone or is ambiguous — applying is refused with PSG_004.',
  })
  freshness: 'fresh' | 'relocated' | 'stale';

  @Field(() => Integer, { nullable: true })
  start: number | null;

  @Field(() => Integer, { nullable: true })
  end: number | null;
}

@Schema({ description: 'A suggested rewrite of one passage, anchored to the draft revision and selection it was made from.' })
export class PassageSuggestionResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => Integer)
  chapter: number;

  @Field(() => Integer)
  baseRevision: number;

  @Field(() => Integer)
  baseSaveSeq: number;

  @Field(() => Integer)
  anchorStart: number;

  @Field(() => Integer)
  anchorEnd: number;

  @Field({ description: 'The selected text as it stood when the suggestion was made — the "before".' })
  passage: string;

  @Field({ description: 'The suggested text — the "after".' })
  replacement: string;

  @Field()
  request: string;

  @Field(() => [String], { description: 'Locked story secrets the suggestion appears to give away; empty when none. Review before using it.' })
  leakLines: string[];

  @Field(() => PassageSuggestionStatus)
  status: Generation.PassageSuggestionStatus;

  @Field(() => Integer, { nullable: true, description: 'The draft revision applying it produced.' })
  appliedRevision: number | null;

  @Field(() => PassageLocationResponse)
  location: PassageLocationResponse;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;
}

@Schema()
export class ListPassageSuggestionResponse {
  @Field(() => [PassageSuggestionResponse], { description: 'Open suggestions, newest first, each located against the draft as it stands.' })
  items: PassageSuggestionResponse[];
}

@Schema()
export class ApplyPassageBody extends DraftSaveBase {}

@Schema()
export class AppliedPassageResponse {
  @Field(() => DraftResponse, { description: 'The draft at the new revision the suggestion produced.' })
  draft: DraftResponse;

  @Field(() => PassageSuggestionResponse)
  suggestion: PassageSuggestionResponse;
}

@Schema()
export class RestoreVersionBody extends DraftSaveBase {}

@Schema({ description: "One stored version of a chapter's draft and its cause." })
export class DraftVersionResponse {
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
export class DiffHunkResponse {
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
