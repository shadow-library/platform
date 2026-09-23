import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Body, Get, HttpController, Params, Post, RespondFor } from '@shadow-library/fastify';

import { PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION } from '@server/constants';
import { type Ledger } from '@server/database';

import { BlueprintGateResponse } from '../gate/gate.dto';
import { BlueprintGateService } from '../gate/gate.service';
import { LedgerEntryResponse } from '../ledger/ledger.dto';
import { ledgerEntryStatus } from '../ledger/ledger.service';
import { PremisePreviewBody, PremisePreviewResponse } from '../steps/premise-preview.dto';
import { PremisePreviewService } from '../steps/premise-preview.service';
import { TitleChecksBody, TitleChecksListResponse } from '../steps/title-checks.dto';
import { TitleChecksService } from '../steps/title-checks.service';
import { BlueprintRoundQueue } from './blueprint-round-queue.service';
import { BlueprintStepService } from './blueprint-step.service';
import { isLocking, isSourced } from './blueprint-step.types';
import {
  BlueprintProjectParams,
  BlueprintRoundResponse,
  BlueprintStateResponse,
  BlueprintStepParams,
  CancelBlueprintRoundResponse,
  LockBlueprintStepBody,
  LockBlueprintStepResponse,
  StartBlueprintRoundBody,
} from './blueprint.dto';

function entryResponse(entry: Ledger.Entry): LedgerEntryResponse {
  return { ...entry, status: ledgerEntryStatus(entry) };
}

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects/:projectId/blueprint')
export class BlueprintController {
  constructor(
    private readonly steps: BlueprintStepService,
    private readonly queue: BlueprintRoundQueue,
    private readonly premisePreview: PremisePreviewService,
    private readonly titleChecks: TitleChecksService,
    private readonly gate: BlueprintGateService,
  ) {}

  @Get()
  @RespondFor(200, BlueprintStateResponse)
  async state(@Params() params: BlueprintProjectParams): Promise<BlueprintStateResponse> {
    const states = await this.steps.state(params.projectId);
    return {
      steps: states.map(({ step, latestRound, sliceMoved }) => ({
        key: step.key,
        kind: step.kind,
        source: isSourced(step) ? step.source.step : null,
        phase: step.phase,
        required: isLocking(step) && step.required,
        completionTopics: isLocking(step) ? [...step.completionTopics] : [],
        nudges: [...step.nudges],
        latestRound,
        sliceMoved,
      })),
    };
  }

  @Get('/gate')
  @RespondFor(200, BlueprintGateResponse)
  gateReadiness(@Params() params: BlueprintProjectParams): Promise<BlueprintGateResponse> {
    return this.gate.readiness(params.projectId);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/gate')
  @RespondFor(201, LedgerEntryResponse)
  async openWorkspace(@Params() params: BlueprintProjectParams): Promise<LedgerEntryResponse> {
    return entryResponse(await this.gate.open(params.projectId));
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/steps/:step/rounds')
  @RespondFor(201, BlueprintRoundResponse)
  startRound(@Params() params: BlueprintStepParams, @Body() body: StartBlueprintRoundBody): Promise<BlueprintRoundResponse> {
    return this.queue.start(params.projectId, params.step, body);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/steps/:step/rounds/cancel')
  @RespondFor(200, CancelBlueprintRoundResponse)
  cancelRound(@Params() params: BlueprintStepParams): Promise<CancelBlueprintRoundResponse> {
    return this.queue.cancel(params.projectId, params.step);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/premise/preview')
  @RespondFor(200, PremisePreviewResponse)
  async previewPremise(@Params() params: BlueprintProjectParams, @Body() body: PremisePreviewBody): Promise<PremisePreviewResponse> {
    return { paragraph: await this.premisePreview.preview(params.projectId, body.premise) };
  }

  @Post('/title/checks')
  @RespondFor(200, TitleChecksListResponse)
  async checkTitles(@Params() params: BlueprintProjectParams, @Body() body: TitleChecksBody): Promise<TitleChecksListResponse> {
    return { results: await this.titleChecks.check(params.projectId, body.titles) };
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/steps/:step/lock')
  @RespondFor(200, LockBlueprintStepResponse)
  async lock(@Params() params: BlueprintStepParams, @Body() body: LockBlueprintStepBody): Promise<LockBlueprintStepResponse> {
    const result = await this.steps.lock(params.projectId, params.step, body.selection);
    return {
      entries: result.entries.map(entryResponse),
      withdrawn: result.withdrawn.map(entryResponse),
      proposalId: result.proposal?.id ?? null,
      followUp: result.followUp,
    };
  }
}
