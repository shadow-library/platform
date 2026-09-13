import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import {
  AppearanceConfidenceLevel,
  IllustrationAttachableReferenceRole,
  IllustrationOrigin,
  IllustrationReferenceOrigin,
  IllustrationReferenceRole,
  IllustrationReferenceSource,
  IllustrationReferenceWarningCode,
  IllustrationSaveTarget,
  IllustrationStatus,
  IllustrationSubjectType,
} from '@server/common';
import { type Illustration } from '@server/database';

import { type ReferenceWarningCode } from './illustration-reference.service';

export const MAX_ATTACHED_REFERENCES = 8;
export const MAX_REFERENCE_NOTE_LENGTH = 300;
export const MAX_REFERENCE_OPTIONS_LIMIT = 200;

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
export class AttachReferenceBody {
  @Field(() => IllustrationReferenceSource, { description: 'Which kind of project image to attach.' })
  source: Illustration.ReferenceSource;

  @Field({
    optional: true,
    maxLength: 200,
    description:
      "Entity key for 'portrait'; the numeric id for 'gallery', 'chapter-image' and 'candidate' (an illustration id, resolving to its selected image); omitted for 'cover'.",
  })
  sourceId?: string;

  @Field(() => IllustrationAttachableReferenceRole, {
    description: "'likeness' pins the face, hair, build and attire of the figure it shows; 'style' lends palette, medium and rendering only.",
  })
  role: Illustration.AttachableReferenceRole;

  @Field({
    optional: true,
    maxLength: MAX_REFERENCE_NOTE_LENGTH,
    description: 'Free text scoping the reference, e.g. "the armored man in the center" or "the scar only". Trimmed; blank is dropped.',
  })
  note?: string;
}

@Schema()
export class StartIllustrationBody {
  @Field(() => IllustrationSubjectType)
  subjectType: Illustration.SubjectType;

  @Field({ optional: true, description: "Entity key for 'entity', the chapter number for 'chapter'; omitted for the project cover." })
  subjectKey?: string;

  @Field({ optional: true, description: 'Opening art direction from the author; becomes the first entry in the prompt spec instruction list.' })
  instruction?: string;

  @Field(() => [AttachReferenceBody], {
    optional: true,
    maxItems: MAX_ATTACHED_REFERENCES,
    description: "Project images to send as references, in priority order. More than the image model's capacity is refused with ILL_011.",
  })
  references?: AttachReferenceBody[];

  @Field({ optional: true, description: "Whether the auto-rules (the entity's portrait, a chapter's cast portraits) may add references. Defaults to true." })
  autoReferences?: boolean;
}

@Schema()
export class UpdateIllustrationReferencesBody {
  @Field(() => [AttachReferenceBody], {
    maxItems: MAX_ATTACHED_REFERENCES,
    description:
      'The complete attached set, replacing the stored one. Entries already attached (same source and sourceId) are kept with a warning when out of slots; new entries must fit beside the edit source the next refinement sends, or ILL_011.',
  })
  references: AttachReferenceBody[];

  @Field({ optional: true, description: 'Whether the auto-rules may add references on the next refinement. Keeps the stored value when omitted.' })
  autoReferences?: boolean;
}

@Schema()
export class ReferenceOptionsQuery {
  @Field(() => IllustrationSubjectType, { description: 'The subject the auto-preview is computed for.' })
  subjectType: Illustration.SubjectType;

  @Field({ optional: true, description: "Entity key for 'entity', the chapter number for 'chapter'; omitted for the project cover." })
  subjectKey?: string;

  @Field(() => Integer, { optional: true, minimum: 1, maximum: MAX_REFERENCE_OPTIONS_LIMIT, description: 'Maximum entries per group. Defaults to 50.' })
  @Transform('int:parse')
  limit?: number;
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
export class IllustrationReferenceResponse {
  @Field(() => IllustrationReferenceSource)
  source: Illustration.ReferenceSource;

  @Field({ optional: true })
  sourceId?: string;

  @Field({ description: 'Storage ref, matched by candidate `referenceRefs`.' })
  ref: string;

  @Field(() => IllustrationReferenceRole, { description: "'edit-source' is the image a refinement reworks; only the server assigns it." })
  role: Illustration.ReferenceRole;

  @Field(() => IllustrationReferenceOrigin)
  origin: Illustration.ReferenceOrigin;

  @Field({ description: "The auto-rule that added the reference (e.g. 'auto:entity-portrait', 'auto:chapter-cast', 'auto:edit-source') or 'attached'." })
  reason: string;

  @Field({ optional: true })
  note?: string;

  @Field({ optional: true, description: 'What the image showed when it was sent, as named in the reference manifest.' })
  label?: string;

  @Field({ optional: true, description: 'Display name of the pictured entity, for portrait references.' })
  name?: string;

  @Field({ description: 'Absolute public object-storage URL resolved using the server runtime configuration.' })
  url: string;
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

  @Field(() => [String], { description: 'Storage refs of the references sent with this candidate, in send order; each matches an entry in the illustration `references`.' })
  referenceRefs: string[];

  @Field(() => [IllustrationReferenceResponse], { description: 'The references exactly as sent with this candidate — role, note, label, origin and reason — in send order.' })
  references: IllustrationReferenceResponse[];
}

@Schema()
export class AttachedReferenceResponse {
  @Field(() => IllustrationReferenceSource)
  source: Illustration.ReferenceSource;

  @Field({ optional: true })
  sourceId?: string;

  @Field(() => IllustrationAttachableReferenceRole)
  role: Illustration.AttachableReferenceRole;

  @Field({ optional: true })
  note?: string;
}

@Schema()
export class ReferenceWarningResponse {
  @Field(() => IllustrationReferenceWarningCode)
  code: ReferenceWarningCode;

  @Field(() => IllustrationReferenceSource)
  source: Illustration.ReferenceSource;

  @Field({ optional: true })
  sourceId?: string;

  @Field()
  reason: string;
}

@Schema()
export class AppearanceDescriptionResponse {
  @Field(() => AppearanceConfidenceLevel, { description: 'How sure the vision model was that it described the intended figure.' })
  confidence: Illustration.AppearanceDescription['confidence'];

  @Field({ optional: true, description: 'Set when the image was ambiguous, e.g. several figures and no note naming which one.' })
  ambiguity?: string;
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

  @Field(() => IllustrationOrigin, {
    description: "'uploaded' when the session was opened on a cover the author supplied rather than composed from the canon; its prompt only reworks that image.",
  })
  origin: Illustration.Origin;

  @Field(() => [String], { description: 'The author instruction list, in application order — refine edits address it by index.' })
  instructions: string[];

  @Field({ description: 'The exact prompt text sent to the image model for the current revision.' })
  prompt: string;

  @Field(() => [IllustrationCandidateResponse])
  candidates: IllustrationCandidateResponse[];

  @Field(() => [IllustrationReferenceResponse], {
    description: 'Latest per image: one entry per image ever sent, carrying its most recent role and note. Per-round history lives on each candidate `references`.',
  })
  references: IllustrationReferenceResponse[];

  @Field(() => [AttachedReferenceResponse], { description: 'The author-attached set every refinement re-resolves; change it with PUT …/references.' })
  attachedReferences: AttachedReferenceResponse[];

  @Field({ description: 'Whether the auto-rules may add references.' })
  autoReferences: boolean;

  @Field({ optional: true, nullable: true })
  selectedRef?: string | null;

  @Field({ optional: true, nullable: true })
  selectedUrl?: string | null;

  @Field({ optional: true, description: 'Appearance the composer derived because the entity had none; PATCH it onto the entity to make it canon.' })
  suggestedAppearance?: string;

  @Field(() => AppearanceDescriptionResponse, {
    optional: true,
    description: 'Set when `suggestedAppearance` was described from a likeness reference rather than derived from canon.',
  })
  appearanceDescription?: AppearanceDescriptionResponse;

  @Field(() => [ReferenceWarningResponse], {
    optional: true,
    description: 'References this request skipped, trimmed or merged. Returned by start, refine and references updates only; never stored.',
  })
  referenceWarnings?: ReferenceWarningResponse[];

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ReferenceOptionResponse {
  @Field(() => IllustrationReferenceSource)
  source: Illustration.ReferenceSource;

  @Field({ optional: true, description: 'Pass back unchanged as the attach `sourceId`.' })
  sourceId?: string;

  @Field()
  label: string;

  @Field({ description: 'Absolute public object-storage URL resolved using the server runtime configuration.' })
  url: string;

  @Field({ optional: true })
  entityKey?: string;

  @Field(() => Integer, { optional: true })
  chapter?: number;

  @Field({ optional: true })
  caption?: string;

  @Field(() => IllustrationSubjectType, { optional: true })
  subjectType?: Illustration.SubjectType;

  @Field({ optional: true, nullable: true })
  subjectKey?: string | null;
}

@Schema()
export class ReferenceOptionsResponse {
  @Field(() => Integer, { description: 'How many reference images the project image model accepts per generation.' })
  capacity: number;

  @Field(() => ReferenceOptionResponse, { optional: true })
  cover?: ReferenceOptionResponse;

  @Field(() => [ReferenceOptionResponse], { description: 'Entities with a portrait, by name.' })
  portraits: ReferenceOptionResponse[];

  @Field(() => [ReferenceOptionResponse], { description: 'Entity gallery images, newest first.' })
  gallery: ReferenceOptionResponse[];

  @Field(() => [ReferenceOptionResponse], { description: 'Chapter scene images, newest first.' })
  chapterImages: ReferenceOptionResponse[];

  @Field(() => [ReferenceOptionResponse], { description: 'Illustrations with a selected image, newest first.' })
  candidates: ReferenceOptionResponse[];

  @Field({ description: 'True when any group was cut at `limit`.' })
  truncated: boolean;

  @Field(() => [IllustrationReferenceResponse], {
    description: 'What the auto-rules would attach at start for this subject, in send order, checked against storage metadata only.',
  })
  autoPreview: IllustrationReferenceResponse[];

  @Field(() => [ReferenceWarningResponse], { description: 'Auto references the preview would skip or trim.' })
  autoPreviewWarnings: ReferenceWarningResponse[];
}

@Schema({ description: "Newest first. Setting a project cover by upload, ingest, import or promotion opens an 'uploaded' cover illustration on it." })
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
