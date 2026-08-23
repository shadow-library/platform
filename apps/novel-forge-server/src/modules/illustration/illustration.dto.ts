import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { IllustrationSaveTarget, IllustrationStatus, IllustrationSubjectType } from '@server/common';
import { type Illustration } from '@server/database';

@Schema()
export class IllustrationProjectParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class IllustrationParams extends IllustrationProjectParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  id: bigint;
}

@Schema()
export class StartIllustrationBody {
  @Field(() => IllustrationSubjectType)
  subjectType: Illustration.SubjectType;

  @Field({ optional: true, description: "Entity key for 'entity', the chapter number for 'chapter'; omitted for the project cover." })
  subjectKey?: string;

  @Field({ optional: true, description: 'Opening art direction from the author; becomes the first entry in the prompt spec instruction list.' })
  instruction?: string;
}

@Schema()
export class ReplaceInstruction {
  @Field(() => Integer, { minimum: 0 })
  index: number;

  @Field({ minLength: 1 })
  text: string;
}

@Schema({ minProperties: 1, maxProperties: 1, description: 'Exactly one structured edit to the prompt spec instruction list.' })
export class RefineIllustrationBody {
  @Field({ optional: true, description: 'Appends an instruction.' })
  add?: string;

  @Field(() => Integer, { optional: true, minimum: 0, description: 'Removes the instruction at this index.' })
  removeIndex?: number;

  @Field(() => ReplaceInstruction, { optional: true, description: 'Replaces the instruction at the given index.' })
  replace?: ReplaceInstruction;
}

@Schema()
export class SelectIllustrationBody {
  @Field({ description: 'Storage ref of the candidate to select; must be one of this illustration’s candidates.' })
  ref: string;
}

@Schema()
export class SaveIllustrationBody {
  @Field(() => IllustrationSaveTarget, {
    description: "Where the selected image lands: 'portrait' and 'gallery' for an entity subject, 'chapter' for a chapter subject, 'cover' for the project cover.",
  })
  target: Illustration.SaveTarget;
}

@Schema()
export class ListIllustrationsQuery {
  @Field(() => IllustrationSubjectType, { optional: true })
  subjectType?: Illustration.SubjectType;

  @Field({ optional: true })
  subjectKey?: string;
}

@Schema()
export class IllustrationCandidateResponse {
  @Field()
  ref: string;

  @Field({ description: 'Absolute public object-storage URL resolved using the server runtime configuration.' })
  imageUrl: string;

  @Field()
  createdAt: string;

  @Field()
  instructionsHash: string;
}

@Schema()
export class IllustrationResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => String)
  projectId: bigint;

  @Field(() => IllustrationSubjectType)
  subjectType: Illustration.SubjectType;

  @Field({ optional: true, nullable: true })
  subjectKey?: string | null;

  @Field(() => IllustrationStatus)
  status: Illustration.Status;

  @Field(() => Integer)
  revision: number;

  @Field(() => [String], { description: 'The author instruction list, in application order — refine edits address it by index.' })
  instructions: string[];

  @Field({ description: 'The exact prompt text sent to the image model for the current revision.' })
  prompt: string;

  @Field(() => [IllustrationCandidateResponse])
  candidates: IllustrationCandidateResponse[];

  @Field({ optional: true, nullable: true })
  selectedRef?: string | null;

  @Field({ optional: true, nullable: true })
  selectedUrl?: string | null;

  @Field({ optional: true, description: 'Appearance the composer derived because the entity had none; PATCH it onto the entity to make it canon.' })
  suggestedAppearance?: string;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ListIllustrationsResponse {
  @Field(() => [IllustrationResponse])
  items: IllustrationResponse[];
}

@Schema()
export class LegacyIllustrationParams extends IllustrationProjectParams {
  @Field()
  entityKey: string;
}

@Schema()
export class LegacyStartIllustrationBody {
  @Field({ optional: true })
  instruction?: string;
}

@Schema()
export class LegacySessionBody {
  @Field({ description: 'Illustration id, named `sessionId` for the retired in-memory session API.' })
  sessionId: string;
}

@Schema()
export class LegacyRefineIllustrationBody extends LegacySessionBody {
  @Field()
  instruction: string;
}

@Schema()
export class LegacyStartIllustrationResponse {
  @Field()
  sessionId: string;

  @Field()
  previewUrl: string;
}

@Schema()
export class LegacyRefineIllustrationResponse {
  @Field()
  previewUrl: string;
}

@Schema()
export class LegacySaveIllustrationResponse {
  @Field()
  saved: boolean;

  @Field({ description: 'Absolute public object-storage URL resolved using the server runtime configuration.' })
  imageUrl: string;
}

@Schema()
export class LegacyCancelIllustrationResponse {
  @Field()
  cancelled: boolean;
}
