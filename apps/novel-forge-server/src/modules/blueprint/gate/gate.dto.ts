import { EnumType, Field, Schema } from '@shadow-library/class-schema';

import { BlueprintPhase } from '@server/common';
import { type Ledger } from '@server/database';

import { type GateWarningKind } from './gate';

const GateWarningType = EnumType.create('GateWarningKind', ['arc_stale', 'arc_brief_range', 'brief_stale', 'check_outdated']);

@Schema()
export class GateStepGapResponse {
  @Field(() => BlueprintPhase)
  phase: Ledger.Phase;

  @Field()
  phaseLabel: string;

  @Field({ description: 'The step to open; the client holds its wording.' })
  step: string;
}

@Schema()
export class GateWarningResponse {
  @Field(() => GateWarningType)
  kind: GateWarningKind;

  @Field()
  title: string;

  @Field()
  detail: string;

  @Field({ description: 'The step whose lock settles the warning.' })
  step: string;

  @Field(() => [String], { description: 'Other steps the warning is about, by key; the client holds their wording.' })
  steps: string[];
}

@Schema()
export class BlueprintGateResponse {
  @Field({ description: 'Whether every required step that applies to this novel is done. Checked without a model.' })
  ready: boolean;

  @Field({ description: 'Whether the gate entry already exists — the project is in the Workspace.' })
  opened: boolean;

  @Field(() => [GateStepGapResponse], { description: 'Required, applicable steps still waiting on a lock; the gate refuses while any remain.' })
  unfinished: GateStepGapResponse[];

  @Field(() => [GateWarningResponse], { description: 'What the author should see before opening the Workspace. None of them blocks the gate.' })
  warnings: GateWarningResponse[];
}
