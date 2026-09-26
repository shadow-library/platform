import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Body, Get, HttpController, Params, Post, Put, RespondFor } from '@shadow-library/fastify';

import { GENERATION_RUN_PERMISSION, PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION } from '@server/constants';

import { ChapterParams, ProjectParams, WorkflowRunResponse } from '../generation/generation.dto';
import {
  FinalizeReviewItemDecisionBody,
  FinalizeReviewItemParams,
  FinalizeReviewResponse,
  FinalizeReviewSettingsBody,
  FinalizeReviewSettingsResponse,
} from './finalize-review.dto';
import { FinalizeReviewService } from './finalize-review.service';

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects/:projectId')
export class FinalizeReviewController {
  constructor(private readonly reviewService: FinalizeReviewService) {}

  @Get('/drafts/:n/finalize-review')
  @RespondFor(200, FinalizeReviewResponse)
  getReview(@Params() params: ChapterParams): Promise<FinalizeReviewResponse> {
    return this.reviewService.get(params.projectId, params.n);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @BotPermission(GENERATION_RUN_PERMISSION)
  @Post('/drafts/:n/finalize-review/prepare')
  @RespondFor(200, FinalizeReviewResponse)
  prepareReview(@Params() params: ChapterParams): Promise<FinalizeReviewResponse> {
    return this.reviewService.prepare(params.projectId, params.n);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/drafts/:n/finalize-review/items/:itemId/decision')
  @RespondFor(200, FinalizeReviewResponse)
  decideItem(@Params() params: FinalizeReviewItemParams, @Body() body: FinalizeReviewItemDecisionBody): Promise<FinalizeReviewResponse> {
    return this.reviewService.decide(params.projectId, params.n, params.itemId, body);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/drafts/:n/finalize-review/keep-routine')
  @RespondFor(200, FinalizeReviewResponse)
  keepRoutine(@Params() params: ChapterParams): Promise<FinalizeReviewResponse> {
    return this.reviewService.keepRoutine(params.projectId, params.n);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @BotPermission(GENERATION_RUN_PERMISSION)
  @Post('/drafts/:n/finalize-review/finalize')
  @RespondFor(200, WorkflowRunResponse)
  finalize(@Params() params: ChapterParams): Promise<WorkflowRunResponse> {
    return this.reviewService.finalize(params.projectId, params.n);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/drafts/:n/finalize-review/revert')
  @RespondFor(200, FinalizeReviewResponse)
  revert(@Params() params: ChapterParams): Promise<FinalizeReviewResponse> {
    return this.reviewService.revert(params.projectId, params.n);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Put('/finalize-review/settings')
  @RespondFor(200, FinalizeReviewSettingsResponse)
  async updateSettings(@Params() params: ProjectParams, @Body() body: FinalizeReviewSettingsBody): Promise<FinalizeReviewSettingsResponse> {
    return { autoKeep: await this.reviewService.setAutoKeep(params.projectId, body.autoKeep) };
  }
}
