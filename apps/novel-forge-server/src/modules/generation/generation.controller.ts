/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Body, Get, HttpController, HttpStatus, Params, Patch, Post, Put, Query, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */

import {
  BriefResponse,
  ChapterParams,
  ContinuityProposalResponse,
  DraftResponse,
  DraftRevisionResponse,
  FeedbackBody,
  FinalizeBody,
  GenerateBody,
  GenerateGrokBody,
  ImportDraftBody,
  OutlineBody,
  PlanBody,
  ProjectParams,
  ReviseDraftBody,
  RevisionParams,
  RunParams,
  SearchQuery,
  SeedFromBriefBody,
  UpdateBriefBody,
  UpdateContinuityBody,
  UpdateDraftBody,
  UserFeedbackResponse,
  WorkflowRunDetailResponse,
  WorkflowRunResponse,
} from './generation.dto';
import { GenerationService } from './generation.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/projects/:projectId')
export class GenerationController {
  constructor(private readonly generationService: GenerationService) {}

  // ─── Planning ───────────────────────────────────────────────────────────────

  @Post('/seed-from-brief')
  @RespondFor(200, WorkflowRunResponse)
  seedFromBrief(@Params() params: ProjectParams, @Body() body: SeedFromBriefBody): Promise<WorkflowRunResponse> {
    return this.generationService.seedFromBrief(params.projectId, body) as unknown as Promise<WorkflowRunResponse>;
  }

  @Post('/plan')
  plan(@Params() params: ProjectParams, @Body() body: PlanBody): Promise<unknown> {
    return this.generationService.plan(params.projectId, body);
  }

  @Post('/approve')
  approvePlan(@Params() params: ProjectParams): Promise<unknown> {
    return this.generationService.approvePlan(params.projectId);
  }

  // ─── Outlines / Briefs ──────────────────────────────────────────────────────

  @Post('/outline')
  outline(@Params() params: ProjectParams, @Body() body: OutlineBody): Promise<unknown> {
    return this.generationService.outline(params.projectId, body);
  }

  @Get('/briefs/:n')
  @RespondFor(200, BriefResponse)
  getBrief(@Params() params: ChapterParams): Promise<BriefResponse> {
    return this.generationService.getBrief(params.projectId, params.n) as unknown as Promise<BriefResponse>;
  }

  @Put('/briefs/:n')
  @RespondFor(200, BriefResponse)
  updateBrief(@Params() params: ChapterParams, @Body() body: UpdateBriefBody): Promise<BriefResponse> {
    return this.generationService.updateBrief(params.projectId, params.n, body) as unknown as Promise<BriefResponse>;
  }

  // ─── Generation + Drafts ────────────────────────────────────────────────────

  @Post('/generate')
  @RespondFor(200, WorkflowRunResponse)
  generate(@Params() params: ProjectParams, @Body() body: GenerateBody): Promise<WorkflowRunResponse> {
    return this.generationService.generate(params.projectId, body) as unknown as Promise<WorkflowRunResponse>;
  }

  @Get('/drafts')
  listDrafts(@Params() params: ProjectParams): Promise<unknown> {
    return this.generationService.listDrafts(params.projectId);
  }

  @Get('/drafts/:n')
  @RespondFor(200, DraftResponse)
  getDraft(@Params() params: ChapterParams): Promise<DraftResponse> {
    return this.generationService.getDraft(params.projectId, params.n) as unknown as Promise<DraftResponse>;
  }

  @Put('/drafts/:n')
  @RespondFor(200, DraftResponse)
  updateDraft(@Params() params: ChapterParams, @Body() body: UpdateDraftBody): Promise<DraftResponse> {
    return this.generationService.updateDraft(params.projectId, params.n, body) as unknown as Promise<DraftResponse>;
  }

  @Post('/drafts/:n/revise')
  @RespondFor(200, DraftResponse)
  reviseDraft(@Params() params: ChapterParams, @Body() body: ReviseDraftBody): Promise<DraftResponse> {
    return this.generationService.reviseDraft(params.projectId, params.n, body) as unknown as Promise<DraftResponse>;
  }

  @Post('/drafts/:n/judge')
  judgeDraft(@Params() params: ChapterParams): Promise<unknown> {
    return this.generationService.judgeDraft(params.projectId, params.n);
  }

  @Post('/drafts/:n/feedback')
  @RespondFor(201, UserFeedbackResponse)
  @HttpStatus(201)
  feedbackDraft(@Params() params: ChapterParams, @Body() body: FeedbackBody): Promise<UserFeedbackResponse> {
    return this.generationService.feedbackDraft(params.projectId, params.n, body) as unknown as Promise<UserFeedbackResponse>;
  }

  @Post('/drafts/:n/approve')
  @RespondFor(200, DraftResponse)
  approveDraft(@Params() params: ChapterParams): Promise<DraftResponse> {
    return this.generationService.approveDraft(params.projectId, params.n) as unknown as Promise<DraftResponse>;
  }

  @Get('/drafts/:n/revisions')
  listRevisions(@Params() params: ChapterParams): Promise<unknown> {
    return this.generationService.listRevisions(params.projectId, params.n);
  }

  @Get('/drafts/:n/revisions/:r')
  @RespondFor(200, DraftRevisionResponse)
  getRevision(@Params() params: RevisionParams): Promise<DraftRevisionResponse> {
    return this.generationService.getRevision(params.projectId, params.n, params.r) as unknown as Promise<DraftRevisionResponse>;
  }

  @Get('/drafts/:n/prompt')
  getDraftPrompt(@Params() params: ChapterParams): Promise<unknown> {
    return this.generationService.getDraftPrompt(params.projectId, params.n);
  }

  @Post('/drafts/:n/import')
  @RespondFor(200, DraftResponse)
  importDraft(@Params() params: ChapterParams, @Body() body: ImportDraftBody): Promise<DraftResponse> {
    return this.generationService.importDraft(params.projectId, params.n, body) as unknown as Promise<DraftResponse>;
  }

  // ─── Finalize ───────────────────────────────────────────────────────────────

  @Post('/finalize')
  @RespondFor(200, WorkflowRunResponse)
  finalize(@Params() params: ProjectParams, @Body() body: FinalizeBody): Promise<WorkflowRunResponse> {
    return this.generationService.finalize(params.projectId, body) as unknown as Promise<WorkflowRunResponse>;
  }

  // ─── Grok interlude ─────────────────────────────────────────────────────────

  @Post('/chapters/:n/generate-grok')
  @RespondFor(200, DraftResponse)
  generateGrok(@Params() params: ChapterParams, @Body() body: GenerateGrokBody): Promise<DraftResponse> {
    return this.generationService.generateGrok(params.projectId, params.n, body) as unknown as Promise<DraftResponse>;
  }

  @Post('/chapters/:n/propose-continuity')
  @RespondFor(200, ContinuityProposalResponse)
  proposeContinuity(@Params() params: ChapterParams): Promise<ContinuityProposalResponse> {
    return this.generationService.proposeContinuity(params.projectId, params.n) as unknown as Promise<ContinuityProposalResponse>;
  }

  @Get('/chapters/:n/continuity-proposal')
  @RespondFor(200, ContinuityProposalResponse)
  getContinuityProposal(@Params() params: ChapterParams): Promise<ContinuityProposalResponse> {
    return this.generationService.getContinuityProposal(params.projectId, params.n) as unknown as Promise<ContinuityProposalResponse>;
  }

  @Patch('/chapters/:n/continuity-proposal')
  @RespondFor(200, ContinuityProposalResponse)
  updateContinuityProposal(@Params() params: ChapterParams, @Body() body: UpdateContinuityBody): Promise<ContinuityProposalResponse> {
    return this.generationService.updateContinuityProposal(params.projectId, params.n, body) as unknown as Promise<ContinuityProposalResponse>;
  }

  @Post('/chapters/:n/continuity-proposal/apply')
  @RespondFor(200, ContinuityProposalResponse)
  applyContinuityProposal(@Params() params: ChapterParams): Promise<ContinuityProposalResponse> {
    return this.generationService.applyContinuityProposal(params.projectId, params.n) as unknown as Promise<ContinuityProposalResponse>;
  }

  @Post('/chapters/:n/continuity-proposal/discard')
  @RespondFor(200, ContinuityProposalResponse)
  discardContinuityProposal(@Params() params: ChapterParams): Promise<ContinuityProposalResponse> {
    return this.generationService.discardContinuityProposal(params.projectId, params.n) as unknown as Promise<ContinuityProposalResponse>;
  }

  // ─── Validation / Review ────────────────────────────────────────────────────

  @Post('/validate')
  @RespondFor(200, WorkflowRunResponse)
  validate(@Params() params: ProjectParams): Promise<WorkflowRunResponse> {
    return this.generationService.validate(params.projectId) as unknown as Promise<WorkflowRunResponse>;
  }

  @Post('/chapters/:n/review')
  reviewChapter(@Params() params: ChapterParams): Promise<unknown> {
    return this.generationService.reviewChapter(params.projectId, params.n);
  }

  // ─── Human review queue / runs ───────────────────────────────────────────────

  @Get('/review-queue')
  getReviewQueue(@Params() params: ProjectParams): Promise<unknown> {
    return this.generationService.getReviewQueue(params.projectId);
  }

  @Get('/runs')
  listRuns(@Params() params: ProjectParams): Promise<unknown> {
    return this.generationService.listRuns(params.projectId);
  }

  @Get('/runs/:runId')
  @RespondFor(200, WorkflowRunDetailResponse)
  getRun(@Params() params: RunParams): Promise<WorkflowRunDetailResponse> {
    return this.generationService.getRun(params.projectId, params.runId) as unknown as Promise<WorkflowRunDetailResponse>;
  }

  @Get('/ai-usage')
  getAiUsage(@Params() params: ProjectParams): Promise<unknown> {
    return this.generationService.getAiUsage(params.projectId);
  }

  // ─── Search ─────────────────────────────────────────────────────────────────

  @Get('/search')
  search(@Params() params: ProjectParams, @Query() query: SearchQuery): Promise<unknown> {
    return this.generationService.search(params.projectId, query);
  }

  // ─── Manuscript ─────────────────────────────────────────────────────────────

  @Get('/manuscript')
  getManuscript(@Params() params: ProjectParams): Promise<unknown> {
    return this.generationService.getManuscript(params.projectId);
  }

  // ─── Backfill ───────────────────────────────────────────────────────────────

  @Post('/backfill')
  backfill(@Params() params: ProjectParams): Promise<unknown> {
    return this.generationService.backfill(params.projectId);
  }
}
