import { EnumType, Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { BlueprintPhase, BlueprintRoundStatus } from '@server/common';
import { type Blueprint, type Ledger } from '@server/database';

import { LedgerEntryResponse } from '../ledger/ledger.dto';

const BlueprintFeedbackVerdict = EnumType.create('BlueprintFeedbackVerdict', ['more', 'not', 'mix']);
const BlueprintStepKind = EnumType.create('BlueprintStepKind', ['screen', 'pass']);
const BlueprintCancelOutcome = EnumType.create('BlueprintCancelOutcome', ['cancelled', 'stopping', 'already_settled']);

@Schema()
export class BlueprintProjectParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class BlueprintStepParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field({ pattern: '^[a-z][a-z0-9_]{0,59}$' })
  step: string;
}

@Schema()
export class BlueprintOptionFeedbackBody {
  @Field({ minLength: 1, maxLength: 40, description: 'An option of the step’s latest ready round.' })
  optionId: string;

  @Field(() => BlueprintFeedbackVerdict, { description: '`not` with a reason also records a rejected ledger entry naming the option.' })
  verdict: Blueprint.FeedbackVerdict;

  @Field({ optional: true, maxLength: 1000 })
  reason?: string;
}

@Schema()
export class StartBlueprintRoundBody {
  @Field({ optional: true, maxLength: 2000, description: 'Applies to this round only unless `keepAsDirection` is set.' })
  steer?: string;

  @Field(() => [String], { optional: true, maxItems: 6, description: 'Short steers the author picked from the step’s nudge chips.' })
  nudges?: string[];

  @Field({ optional: true, description: 'Records the steer as a direction entry every later step reads.' })
  keepAsDirection?: boolean;

  @Field(() => [BlueprintOptionFeedbackBody], { optional: true, maxItems: 20 })
  feedback?: BlueprintOptionFeedbackBody[];

  @Field(() => Object, { optional: true, additionalProperties: true, description: 'The step’s own input, whose shape depends on the step; refused by a step that takes none.' })
  input?: Record<string, unknown>;
}

@Schema()
export class LockBlueprintStepBody {
  @Field(() => Object, { additionalProperties: true, description: 'The chosen option ids and the author’s edits, in the shape the step defines.' })
  selection: Record<string, unknown>;
}

@Schema()
export class BlueprintOptionFeedbackResponse {
  @Field()
  optionId: string;

  @Field(() => BlueprintFeedbackVerdict)
  verdict: Blueprint.FeedbackVerdict;

  @Field({ optional: true })
  reason?: string;
}

@Schema()
export class BlueprintRoundResponse {
  @Field(() => String)
  id: bigint;

  @Field()
  stepKey: string;

  @Field(() => Integer)
  round: number;

  @Field(() => BlueprintRoundStatus, { description: 'A round whose job settled without it reports the job’s outcome.' })
  status: Blueprint.RoundStatus;

  @Field({ nullable: true })
  jobId: string | null;

  @Field({ nullable: true })
  steer: string | null;

  @Field(() => [String])
  nudges: string[];

  @Field()
  keepAsDirection: boolean;

  @Field(() => [BlueprintOptionFeedbackResponse])
  feedback: BlueprintOptionFeedbackResponse[];

  @Field(() => Object, { nullable: true, additionalProperties: true, description: 'The step’s own input for this round.' })
  input: unknown;

  @Field({ nullable: true, description: 'On a pass round, the screen it was started from; that screen’s slice is reworked and the rest kept.' })
  focus: string | null;

  @Field(() => Object, { nullable: true, additionalProperties: true, description: 'The options the round produced, in the shape the step defines; null until the round is ready.' })
  options: unknown;

  @Field({ nullable: true, description: 'The coach’s short reply, shown in the steer thread.' })
  coachMessage: string | null;

  @Field({ nullable: true })
  error: string | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class BlueprintStepStateResponse {
  @Field()
  key: string;

  @Field(() => BlueprintStepKind, { description: 'A pass is one generation feeding several screens; it is never shown or locked itself.' })
  kind: 'screen' | 'pass';

  @Field({ nullable: true, description: 'The pass this screen draws its rounds from; screens sharing a pass share one round and one progress indicator.' })
  source: string | null;

  @Field(() => BlueprintPhase)
  phase: Ledger.Phase;

  @Field({ description: 'Whether locking the step counts towards its phase’s completion.' })
  required: boolean;

  @Field(() => [String], { description: 'Ledger topics whose active decisions mean the step is done.' })
  completionTopics: string[];

  @Field(() => [String])
  nudges: string[];

  @Field(() => BlueprintRoundResponse, {
    nullable: true,
    description: 'The latest round of the step (of its pass, for a sourced screen, with options narrowed to this screen). Earlier rounds are history.',
  })
  latestRound: BlueprintRoundResponse | null;

  @Field({ description: 'The screen is locked and a later whole-pass rerun moved the options it was locked from, so its answer no longer matches what is on screen.' })
  sliceMoved: boolean;
}

@Schema()
export class BlueprintStateResponse {
  @Field(() => [BlueprintStepStateResponse])
  steps: BlueprintStepStateResponse[];
}

@Schema()
export class BlueprintLockFollowUpResponse {
  @Field()
  ok: boolean;

  @Field({ optional: true })
  error?: string;
}

@Schema()
export class LockBlueprintStepResponse {
  @Field(() => [LedgerEntryResponse], { description: 'The entries the lock appended or superseded into place.' })
  entries: LedgerEntryResponse[];

  @Field(() => [LedgerEntryResponse], { description: 'Entries an earlier lock of this step left that the new lock replaced without a successor.' })
  withdrawn: LedgerEntryResponse[];

  @Field(() => String, { nullable: true, description: 'The applied change that materialised the step’s content; revertible from the change history.' })
  proposalId: bigint | null;

  @Field(() => BlueprintLockFollowUpResponse, { nullable: true, description: 'The outcome of work the step runs after the lock commits; a failure there leaves the lock saved.' })
  followUp: BlueprintLockFollowUpResponse | null;
}

@Schema()
export class CancelBlueprintRoundResponse {
  @Field(() => BlueprintCancelOutcome)
  outcome: 'cancelled' | 'stopping' | 'already_settled';

  @Field(() => BlueprintRoundResponse)
  round: BlueprintRoundResponse;
}
