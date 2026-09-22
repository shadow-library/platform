import { EnumType, Field, Schema } from '@shadow-library/class-schema';

import { BlueprintPhase } from '@server/common';
import { type Ledger } from '@server/database';

import { type BlueprintPhaseStatus, type BlueprintStage } from './blueprint-stage';

const BlueprintStageKind = EnumType.create('BlueprintStage', ['blueprint', 'workspace']);
const BlueprintPhaseState = EnumType.create('BlueprintPhaseStatus', ['done', 'current', 'locked', 'open']);

@Schema()
export class BlueprintStepProgressResponse {
  @Field()
  key: string;

  @Field({ description: 'Whether the step counts towards its phase; an optional step never holds a phase back.' })
  required: boolean;

  @Field({ description: 'Whether the active decisions call for the step at all (a power ladder only when progression drives the novel).' })
  applies: boolean;

  @Field({ description: 'A required step is done when every completion topic has an active decision or system entry; an optional one when any active entry exists.' })
  done: boolean;
}

@Schema()
export class BlueprintPhaseProgressResponse {
  @Field(() => BlueprintPhase)
  phase: Ledger.Phase;

  @Field()
  label: string;

  @Field(() => BlueprintPhaseState, {
    description:
      '`done` once every applicable required step is done; `current` for the first unfinished phase; `locked` behind an unfinished phase above it; `open` for an unfinished phase in the Workspace, where nothing is locked.',
  })
  status: BlueprintPhaseStatus;

  @Field({ optional: true, description: 'Why a locked phase is locked, for the author.' })
  lockReason?: string;

  @Field(() => [BlueprintStepProgressResponse])
  steps: BlueprintStepProgressResponse[];
}

@Schema()
export class CoverageItemResponse {
  @Field()
  covered: boolean;

  @Field({ description: 'One line naming what the coverage was read from, or what is missing.' })
  evidence: string;
}

@Schema()
export class ImportPhaseCoverageResponse extends CoverageItemResponse {
  @Field(() => BlueprintPhase)
  phase: Ledger.Phase;

  @Field()
  label: string;

  @Field({ description: 'True only for a missing chapter brief, the one gap that stops generation; every other gap is a recommendation.' })
  blocking: boolean;
}

@Schema()
export class ImportCoverageResponse {
  @Field(() => [ImportPhaseCoverageResponse])
  phases: ImportPhaseCoverageResponse[];

  @Field(() => CoverageItemResponse, { description: 'Whether a voice or pacing and tone page exists; a recommendation, never a blocker.' })
  voice: CoverageItemResponse;

  @Field({ description: 'Whether any gap stops generation.' })
  blocking: boolean;
}

@Schema()
export class BlueprintProgressResponse {
  @Field(() => BlueprintStageKind, { description: '`workspace` once the gate entry exists, or for an import (chapter briefs and no entry a Blueprint step wrote).' })
  stage: BlueprintStage;

  @Field(() => [BlueprintPhaseProgressResponse], { description: 'The seven phases in order.' })
  phases: BlueprintPhaseProgressResponse[];

  @Field(() => ImportCoverageResponse, { optional: true, description: 'Present only for an import: what its content already covers, phase by phase.' })
  importCoverage?: ImportCoverageResponse;
}
