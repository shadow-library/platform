import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Body, Delete, Get, HttpController, type HttpResponse, Params, Post, Res, RespondFor } from '@shadow-library/fastify';

import { GENERATION_RUN_PERMISSION, PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION } from '@server/constants';

import { ChapterParams, ChapterReviewResponse, JudgeResponse } from '../generation/generation.dto';
import {
  ChapterReviewJobResponse,
  ChapterReviewRecordResponse,
  ListChapterReviewsResponse,
  ReviewFindingParams,
  ReviewIdParams,
  ReviewRemedyBody,
  RunChapterReviewBody,
} from './chapter-review.dto';
import { ChapterReviewService } from './chapter-review.service';

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects/:projectId')
export class ChapterReviewController {
  constructor(private readonly reviewService: ChapterReviewService) {}

  @Get('/chapters/:n/reviews')
  @RespondFor(200, ListChapterReviewsResponse)
  listReviews(@Params() params: ChapterParams): Promise<ListChapterReviewsResponse> {
    return this.reviewService.list(params.projectId, params.n);
  }

  @Get('/chapters/:n/reviews/:reviewId')
  @RespondFor(200, ChapterReviewRecordResponse)
  getReview(@Params() params: ReviewIdParams): Promise<ChapterReviewRecordResponse> {
    return this.reviewService.get(params.projectId, params.n, params.reviewId);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @BotPermission(GENERATION_RUN_PERMISSION)
  @Post('/chapters/:n/reviews')
  @RespondFor(201, ChapterReviewRecordResponse)
  @RespondFor(202, ChapterReviewJobResponse)
  async runReview(
    @Params() params: ChapterParams,
    @Body() body: RunChapterReviewBody,
    @Res() response: HttpResponse,
  ): Promise<ChapterReviewRecordResponse | ChapterReviewJobResponse> {
    const started = await this.reviewService.start(params.projectId, params.n, body);
    response.status(started.queued ? 202 : 201);
    return started.queued ? started.job : started.review;
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/chapters/:n/reviews/:reviewId/findings/:findingId/remedy')
  @RespondFor(200, ChapterReviewRecordResponse)
  remedyFinding(@Params() params: ReviewFindingParams, @Body() body: ReviewRemedyBody): Promise<ChapterReviewRecordResponse> {
    return this.reviewService.remedy(params.projectId, params.n, params.reviewId, params.findingId, body);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Delete('/chapters/:n/reviews/:reviewId/findings/:findingId/remedy')
  @RespondFor(200, ChapterReviewRecordResponse)
  clearRemedy(@Params() params: ReviewFindingParams): Promise<ChapterReviewRecordResponse> {
    return this.reviewService.clearRemedy(params.projectId, params.n, params.reviewId, params.findingId);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @BotPermission(GENERATION_RUN_PERMISSION)
  @Post('/drafts/:n/judge')
  @RespondFor(200, JudgeResponse)
  async judgeDraft(@Params() params: ChapterParams): Promise<JudgeResponse> {
    const review = await this.reviewService.run(params.projectId, params.n, { kind: 'judge' });
    const findings = review.findings.map(finding => ({ severity: finding.severity === 'blocking' ? 'hard' : 'soft', text: finding.text }));
    return { verdict: review.verdict ?? 'evaluation_failed', findings };
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @BotPermission(GENERATION_RUN_PERMISSION)
  @Post('/chapters/:n/review')
  @RespondFor(200, ChapterReviewResponse)
  async reviewChapter(@Params() params: ChapterParams): Promise<ChapterReviewResponse> {
    const review = await this.reviewService.run(params.projectId, params.n, { kind: 'editorial' });
    const findings = review.findings.map(finding => ({ severity: finding.severity === 'blocking' ? 'blocking' : 'suggestion', text: finding.text }));
    return { disposition: review.verdict ?? 'revision_requested', note: review.note, findings };
  }
}
