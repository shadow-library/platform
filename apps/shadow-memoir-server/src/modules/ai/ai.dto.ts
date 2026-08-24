/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
const CONSENT_DATA_CLASSES = ['journal_reflection_reason', 'health'];

@Schema()
export class AiTaskIdParams {
  @Field({ pattern: UUID_PATTERN, description: 'Client-minted task id' })
  id: string;
}

@Schema()
export class AiResultIdParams {
  @Field(() => String, { pattern: '^\\d+$', description: 'ai_results.id' })
  @Transform('bigint:parse')
  id: bigint;
}

@Schema()
export class AiTaskSubmitDto {
  @Field({
    pattern: UUID_PATTERN,
    description: 'Client-minted task id; resubmitting the same id converges on the first submission rather than creating a second task or consuming quota twice',
  })
  id: string;

  @Field({ minLength: 1, maxLength: 2000, description: 'The natural-language question (most-sensitive class, ARCHITECTURE §23)' })
  queryText: string;
}

@Schema()
export class AiTaskResponseDto {
  @Field()
  id: string;

  @Field({ enum: ['pending', 'running', 'done', 'failed', 'cancelled', 'held_upgrade'] })
  status: string;

  @Field({ enum: ['adhoc', 'scheduled'] })
  kind: string;

  @Field({ format: 'date-time' })
  submittedAt: string;

  @Field({ format: 'date-time', description: 'Drives the "ready tonight" pending-state copy' })
  expectedBy: string;

  @Field({ optional: true, nullable: true })
  error?: string | null;
}

@Schema()
export class AiConsentGrantDto {
  @Field({ enum: CONSENT_DATA_CLASSES })
  dataClass: string;

  @Field({
    description:
      'true grants (or re-grants) the class; false withdraws it — withdrawal excludes the class from future reads only, past answers already incorporating it are unaffected (PRD §6.7)',
  })
  granted: boolean;
}

@Schema()
export class AiConsentUpdateDto {
  @Field(() => [AiConsentGrantDto], { minItems: 1 })
  grants: AiConsentGrantDto[];
}

@Schema()
export class AiConsentResponseDto {
  @Field({ enum: CONSENT_DATA_CLASSES })
  dataClass: string;

  @Field()
  granted: boolean;

  @Field({ optional: true, nullable: true, format: 'date-time', description: 'Absent when this data class has never been granted' })
  grantedAt?: string | null;

  @Field({ optional: true, nullable: true, format: 'date-time' })
  withdrawnAt?: string | null;
}

@Schema()
export class AiConsentListResponseDto {
  @Field(() => [AiConsentResponseDto], { description: 'One entry per known consent data class, including classes that have never been granted' })
  consents: AiConsentResponseDto[];
}

@Schema()
export class AiScheduledQueryUpsertDto {
  @Field({ minLength: 1, maxLength: 2000, description: 'The one standing question the worker answers every night' })
  queryText: string;

  @Field({ default: true })
  active: boolean;
}

@Schema()
export class AiScheduledQueryResponseDto {
  @Field()
  queryText: string;

  @Field()
  active: boolean;

  @Field({ format: 'date-time' })
  updatedAt: string;
}

@Schema()
export class AiApplySuggestionDto {
  @Field({ minimum: 0, description: "Index into the result's `suggestions` array (0 or 1 — every result carries 1-2 suggestions)" })
  suggestionIndex: number;
}

@Schema()
export class AppliedSuggestionResponseDto {
  @Field()
  id: string;

  @Field()
  resultId: string;

  @Field()
  suggestionIndex: number;

  @Field()
  questId: string;

  @Field({ format: 'date-time' })
  appliedAt: string;
}
