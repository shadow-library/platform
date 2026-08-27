import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';
import { Paginated, PaginationQuery } from '@shadow-library/modules/http-core';

import { SortByTime } from '@server/common';
import { type Ideation, type Project } from '@server/database';

@Schema()
export class SeedProjectParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class CreateSeedBody {
  @Field({ optional: true, description: 'The idea as the author first typed it; kept verbatim as the opening turn of the studio conversation.' })
  spark?: string;
}

@Schema({ description: 'The story seed sheet — idea altitude only: no places, chapter structure, or volume detail.' })
export class SeedFieldsResponse {
  @Field({ optional: true })
  genre?: string;

  @Field(() => [String], { optional: true })
  themes?: string[];

  @Field({ optional: true })
  premise?: string;

  @Field({ optional: true })
  hook?: string;

  @Field({ optional: true, description: 'Lead count plus configuration — one lead, dual leads bonded, an ensemble of four.' })
  castShape?: string;

  @Field({ optional: true })
  progressionSystem?: string;

  @Field({ optional: true })
  protagonistDrive?: string;

  @Field({ optional: true })
  stakes?: string;

  @Field({ optional: true })
  serializationNotes?: string;

  @Field({ optional: true })
  voice?: string;

  @Field({ optional: true })
  workingTitle?: string;
}

@Schema({ description: 'Who settled one sheet field, and on which turn.' })
export class FieldProvenanceResponse {
  @Field(() => String, { enum: ['author', 'studio', 'crossed'] })
  source: Ideation.FieldSource;

  @Field(() => Integer, { nullable: true, description: 'The chat ordinal that settled the field; null when no conversational turn did.' })
  turnOrdinal: number | null;
}

// Enumerated per field rather than a keyed map: an unnormalised additionalProperties ref breaks client
// code generation, the same reason ProjectModelOverrides spells its roles out.
@Schema({ description: 'Provenance for each sheet field the studio or the author has settled.' })
export class SeedProvenanceResponse {
  @Field(() => FieldProvenanceResponse, { optional: true })
  genre?: FieldProvenanceResponse;

  @Field(() => FieldProvenanceResponse, { optional: true })
  themes?: FieldProvenanceResponse;

  @Field(() => FieldProvenanceResponse, { optional: true })
  premise?: FieldProvenanceResponse;

  @Field(() => FieldProvenanceResponse, { optional: true })
  hook?: FieldProvenanceResponse;

  @Field(() => FieldProvenanceResponse, { optional: true })
  castShape?: FieldProvenanceResponse;

  @Field(() => FieldProvenanceResponse, { optional: true })
  progressionSystem?: FieldProvenanceResponse;

  @Field(() => FieldProvenanceResponse, { optional: true })
  protagonistDrive?: FieldProvenanceResponse;

  @Field(() => FieldProvenanceResponse, { optional: true })
  stakes?: FieldProvenanceResponse;

  @Field(() => FieldProvenanceResponse, { optional: true })
  serializationNotes?: FieldProvenanceResponse;

  @Field(() => FieldProvenanceResponse, { optional: true })
  voice?: FieldProvenanceResponse;

  @Field(() => FieldProvenanceResponse, { optional: true })
  workingTitle?: FieldProvenanceResponse;
}

@Schema()
export class SeedConstraintResponse {
  @Field()
  key: string;

  @Field(() => String, { enum: ['shape', 'scope', 'promise'] })
  kind: Ideation.ConstraintKind;

  @Field()
  text: string;

  @Field({ optional: true, description: 'The matching constraint playbook; absent when nothing in the library recognised the constraint.' })
  playbookKey?: string;

  @Field(() => String, { enum: ['author', 'inferred'] })
  lockedBy: Ideation.ConstraintLockedBy;
}

@Schema()
export class TasteAnchorsResponse {
  @Field(() => [String], { description: 'Comparable works the author named at the Taste stage.' })
  comps: string[];

  @Field(() => [String], { description: 'The preferences derived from those comps, in editor terms.' })
  preferences: string[];
}

@Schema()
export class ConceptCardResponse {
  @Field({ description: "The card's stable identity, minted when the round was generated; verdicts are attributed by it, never by position." })
  id: string;

  @Field(() => Integer)
  round: number;

  @Field()
  title: string;

  @Field()
  logline: string;

  @Field()
  engine: string;

  @Field()
  ladder: string;

  @Field()
  posture: string;

  @Field({ optional: true, description: 'The line that would make a browsing reader open chapter one.' })
  hookLine?: string;

  @Field(() => String, { enum: ['offered', 'kept', 'killed', 'crossed'], description: 'Offered until the author reacts to the card, then their verdict.' })
  fate: Ideation.ConceptFate;

  @Field({ optional: true })
  reason?: string;
}

@Schema()
export class ReadinessEntryResponse {
  @Field()
  dimension: string;

  @Field(() => String, { enum: ['strong', 'thin', 'empty'] })
  verdict: Ideation.ReadinessVerdict;

  @Field()
  note: string;

  @Field({ optional: true })
  fix?: string;
}

@Schema()
export class SeedResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => String)
  projectId: bigint;

  @Field({ optional: true, nullable: true, description: 'The ideation chat session driving this seed.' })
  sessionId?: string | null;

  @Field(() => SeedFieldsResponse)
  fields: SeedFieldsResponse;

  @Field(() => SeedProvenanceResponse)
  provenance: SeedProvenanceResponse;

  @Field(() => [SeedConstraintResponse])
  constraints: SeedConstraintResponse[];

  @Field(() => TasteAnchorsResponse)
  tasteAnchors: TasteAnchorsResponse;

  @Field(() => [ConceptCardResponse])
  concepts: ConceptCardResponse[];

  @Field(() => [ReadinessEntryResponse], { description: 'The last stress-pass result; empty until a stress pass has run.' })
  readiness: ReadinessEntryResponse[];

  @Field(() => [String], { description: 'Question-bank ids already answered or skipped, which is what the question router remembers.' })
  askedQuestions: string[];

  @Field(() => Integer)
  revision: number;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema({ description: 'The result of a stress pass: the readiness verdict and the sheet carrying it.' })
export class SeedStressResponse {
  @Field(() => SeedResponse)
  seed: SeedResponse;

  @Field(() => [ReadinessEntryResponse], { description: 'The verdict per dimension, in the fixed dimension order. It advises; it never blocks graduation.' })
  readiness: ReadinessEntryResponse[];

  @Field()
  runId: string;
}

@Schema({ description: 'One card on the Ideas shelf.' })
export class SeedSummaryResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => String)
  projectId: bigint;

  @Field({ optional: true, nullable: true })
  sessionId?: string | null;

  @Field({ optional: true, nullable: true })
  workingTitle?: string | null;

  @Field({ optional: true, nullable: true, description: 'Opening of the spark the author typed, for a seed that has not earned a working title yet.' })
  sparkExcerpt?: string | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class GraduateSeedBody {
  @Field({ minLength: 1, description: 'The novel’s title. Graduation names the project after it; there is no other hard requirement beyond a premise.' })
  title: string;
}

@Schema({ description: 'One sheet field and where its value came from.' })
export class ProvenanceFieldResponse {
  @Field()
  field: string;

  @Field(() => String, { optional: true, enum: ['author', 'studio', 'crossed'], description: 'Absent when the sheet carries a value the studio never recorded a source for.' })
  source?: Ideation.FieldSource;

  @Field(() => Integer, { optional: true, nullable: true, description: 'The chat ordinal that settled the field; null when no conversational turn did.' })
  turnOrdinal?: number | null;
}

@Schema({
  description:
    'The honesty check: how much of the graduated sheet the author decided themselves. The seed is deleted at graduation, so this response is the last place it can be read.',
})
export class ProvenanceSummaryResponse {
  @Field(() => Integer, { description: 'Sheet fields carrying a value.' })
  filled: number;

  @Field(() => Integer)
  author: number;

  @Field(() => Integer)
  studio: number;

  @Field(() => Integer)
  crossed: number;

  @Field(() => Integer, { description: 'Filled fields with no recorded source — counted apart so the check never overstates authorship.' })
  unattributed: number;

  @Field(() => [ProvenanceFieldResponse])
  fields: ProvenanceFieldResponse[];
}

@Schema({ description: 'The project the seed became.' })
export class GraduatedProjectResponse {
  @Field(() => String)
  id: bigint;

  @Field()
  name: string;

  @Field({ optional: true, nullable: true })
  title?: string | null;

  @Field(() => String, { enum: ['seed', 'active'] })
  status: Project.Status;

  @Field({ optional: true, nullable: true })
  premise?: string | null;

  @Field(() => [String], { optional: true, nullable: true })
  themes?: string[] | null;

  @Field({ optional: true, nullable: true, description: 'The chapter-instruction channel, now carrying the narration voice the studio settled.' })
  instructions?: string | null;
}

@Schema({ description: 'What graduation wrote: the project, the two handoff documents, the betrayal facts, and the provenance honesty check.' })
export class GraduationResponse {
  @Field(() => GraduatedProjectResponse)
  project: GraduatedProjectResponse;

  @Field(() => ProvenanceSummaryResponse)
  provenance: ProvenanceSummaryResponse;

  @Field(() => [String], { description: 'The `section/slug` of every bible document graduation wrote — the entire handoff into lore-bible refinement.' })
  documents: string[];

  @Field(() => [String], { description: 'Canon facts written for the named reader-promise betrayals, and nothing else.' })
  factKeys: string[];
}

@Schema()
export class ListSeedsQuery extends PaginationQuery(SortByTime, { sortBy: 'updatedAt', sortOrder: 'desc' }) {}

@Schema()
export class ListSeedsResponse extends Paginated(SeedSummaryResponse) {}
