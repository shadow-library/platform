/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Body, Delete, Get, HttpController, HttpStatus, Params, Patch, Post, Put, Query, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */

import {
  AiUsageResponse,
  ApproveDraftBody,
  ApprovePlanResponse,
  ArcOutlineParams,
  BriefResponse,
  ChapterParams,
  ChapterReviewResponse,
  ContinuityProposalResponse,
  DraftResponse,
  DraftRevisionResponse,
  FeedbackBody,
  FinalizeBody,
  GenerateBody,
  GenerateGrokBody,
  ImportDraftBody,
  JobEnqueueResponse,
  JudgeResponse,
  ListBriefSummaryResponse,
  ListDraftResponse,
  ListDraftRevisionResponse,
  ListGenerationJobResponse,
  ListWorkflowRunResponse,
  MarkdownResponse,
  OutlineArcBody,
  OutlineBody,
  OutlineResponse,
  PlanBody,
  PlanResponse,
  ProjectParams,
  ReviewQueueResponse,
  ReviseDraftBody,
  RevisionParams,
  RunParams,
  SearchQuery,
  SearchResponse,
  SeedFromBriefBody,
  UpdateBriefBody,
  UpdateContinuityBody,
  UpdateDraftBody,
  UserFeedbackResponse,
  WorkflowRunDetailResponse,
  WorkflowRunResponse,
} from './generation.dto';
import { GenerationService } from './generation.service';
import { ProposalResponse } from '../refinement/refinement.dto';

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
  @RespondFor(200, PlanResponse)
  plan(@Params() params: ProjectParams, @Body() body: PlanBody): Promise<PlanResponse> {
    return this.generationService.plan(params.projectId, body) as unknown as Promise<PlanResponse>;
  }

  @Post('/approve')
  @RespondFor(200, ApprovePlanResponse)
  approvePlan(@Params() params: ProjectParams): Promise<ApprovePlanResponse> {
    return this.generationService.approvePlan(params.projectId);
  }

  // ─── Outlines / Briefs ──────────────────────────────────────────────────────

  @Post('/outline')
  @RespondFor(200, OutlineResponse)
  outline(@Params() params: ProjectParams, @Body() body: OutlineBody): Promise<OutlineResponse> {
    return this.generationService.outline(params.projectId, body) as unknown as Promise<OutlineResponse>;
  }

  @Post('/arcs/:arcKey/outline')
  @RespondFor(200, OutlineResponse)
  outlineArc(@Params() params: ArcOutlineParams, @Body() body: OutlineArcBody): Promise<OutlineResponse> {
    return this.generationService.outlineArc(params.projectId, params.arcKey, body) as unknown as Promise<OutlineResponse>;
  }

  @Get('/briefs')
  @RespondFor(200, ListBriefSummaryResponse)
  async listBriefs(@Params() params: ProjectParams): Promise<ListBriefSummaryResponse> {
    const items = await this.generationService.listBriefs(params.projectId);
    return { items } as unknown as ListBriefSummaryResponse;
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
  @HttpStatus(202)
  @RespondFor(202, JobEnqueueResponse)
  generate(@Params() params: ProjectParams, @Body() body: GenerateBody): Promise<JobEnqueueResponse> {
    return this.generationService.generate(params.projectId, body) as unknown as Promise<JobEnqueueResponse>;
  }

  @Get('/jobs')
  @RespondFor(200, ListGenerationJobResponse)
  async listJobs(@Params() params: ProjectParams): Promise<ListGenerationJobResponse> {
    const items = await this.generationService.listJobs(params.projectId);
    return { items } as unknown as ListGenerationJobResponse;
  }

  @Get('/drafts')
  @RespondFor(200, ListDraftResponse)
  async listDrafts(@Params() params: ProjectParams): Promise<ListDraftResponse> {
    const items = await this.generationService.listDrafts(params.projectId);
    return { items } as unknown as ListDraftResponse;
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

  @Delete('/drafts/:n')
  @HttpStatus(204)
  deleteDraft(@Params() params: ChapterParams): Promise<void> {
    return this.generationService.deleteDraft(params.projectId, params.n);
  }

  @Post('/drafts/:n/revise')
  @RespondFor(200, DraftResponse)
  reviseDraft(@Params() params: ChapterParams, @Body() body: ReviseDraftBody): Promise<DraftResponse> {
    return this.generationService.reviseDraft(params.projectId, params.n, body) as unknown as Promise<DraftResponse>;
  }

  @Post('/drafts/:n/judge')
  @RespondFor(200, JudgeResponse)
  judgeDraft(@Params() params: ChapterParams): Promise<JudgeResponse> {
    return this.generationService.judgeDraft(params.projectId, params.n) as unknown as Promise<JudgeResponse>;
  }

  @Post('/drafts/:n/feedback')
  @RespondFor(201, UserFeedbackResponse)
  @HttpStatus(201)
  feedbackDraft(@Params() params: ChapterParams, @Body() body: FeedbackBody): Promise<UserFeedbackResponse> {
    return this.generationService.feedbackDraft(params.projectId, params.n, body) as unknown as Promise<UserFeedbackResponse>;
  }

  @Post('/drafts/:n/approve')
  @RespondFor(200, DraftResponse)
  approveDraft(@Params() params: ChapterParams, @Body() body: ApproveDraftBody): Promise<DraftResponse> {
    return this.generationService.approveDraft(params.projectId, params.n, body) as unknown as Promise<DraftResponse>;
  }

  @Get('/drafts/:n/revisions')
  @RespondFor(200, ListDraftRevisionResponse)
  async listRevisions(@Params() params: ChapterParams): Promise<ListDraftRevisionResponse> {
    const items = await this.generationService.listRevisions(params.projectId, params.n);
    return { items } as unknown as ListDraftRevisionResponse;
  }

  @Get('/drafts/:n/revisions/:r')
  @RespondFor(200, DraftRevisionResponse)
  getRevision(@Params() params: RevisionParams): Promise<DraftRevisionResponse> {
    return this.generationService.getRevision(params.projectId, params.n, params.r) as unknown as Promise<DraftRevisionResponse>;
  }

  @Get('/drafts/:n/prompt')
  @RespondFor(200, MarkdownResponse)
  getDraftPrompt(@Params() params: ChapterParams): Promise<MarkdownResponse> {
    return this.generationService.getDraftPrompt(params.projectId, params.n) as unknown as Promise<MarkdownResponse>;
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

  @Post('/chapters/:n/extract-to-bible')
  @RespondFor(200, ProposalResponse)
  extractToBible(@Params() params: ChapterParams): Promise<ProposalResponse> {
    return this.generationService.extractChapterToBible(params.projectId, params.n) as unknown as Promise<ProposalResponse>;
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
  @RespondFor(200, ChapterReviewResponse)
  reviewChapter(@Params() params: ChapterParams): Promise<ChapterReviewResponse> {
    return this.generationService.reviewChapter(params.projectId, params.n) as unknown as Promise<ChapterReviewResponse>;
  }

  // ─── Human review queue / runs ───────────────────────────────────────────────

  @Get('/review-queue')
  @RespondFor(200, ReviewQueueResponse)
  getReviewQueue(@Params() params: ProjectParams): Promise<ReviewQueueResponse> {
    return this.generationService.getReviewQueue(params.projectId) as unknown as Promise<ReviewQueueResponse>;
  }

  @Get('/runs')
  @RespondFor(200, ListWorkflowRunResponse)
  async listRuns(@Params() params: ProjectParams): Promise<ListWorkflowRunResponse> {
    const items = await this.generationService.listRuns(params.projectId);
    return { items } as unknown as ListWorkflowRunResponse;
  }

  @Get('/runs/:runId')
  @RespondFor(200, WorkflowRunDetailResponse)
  getRun(@Params() params: RunParams): Promise<WorkflowRunDetailResponse> {
    return this.generationService.getRun(params.projectId, params.runId) as unknown as Promise<WorkflowRunDetailResponse>;
  }

  @Get('/ai-usage')
  @RespondFor(200, AiUsageResponse)
  getAiUsage(@Params() params: ProjectParams): Promise<AiUsageResponse> {
    return this.generationService.getAiUsage(params.projectId) as unknown as Promise<AiUsageResponse>;
  }

  // ─── Search ─────────────────────────────────────────────────────────────────

  @Get('/search')
  @RespondFor(200, SearchResponse)
  search(@Params() params: ProjectParams, @Query() query: SearchQuery): Promise<SearchResponse> {
    return this.generationService.search(params.projectId, query) as unknown as Promise<SearchResponse>;
  }

  // ─── Manuscript ─────────────────────────────────────────────────────────────

  @Get('/manuscript')
  @RespondFor(200, MarkdownResponse)
  getManuscript(@Params() params: ProjectParams): Promise<MarkdownResponse> {
    return this.generationService.getManuscript(params.projectId) as unknown as Promise<MarkdownResponse>;
  }

  // ─── Backfill ───────────────────────────────────────────────────────────────

  @Post('/backfill')
  @HttpStatus(202)
  @RespondFor(202, JobEnqueueResponse)
  backfill(@Params() params: ProjectParams): Promise<JobEnqueueResponse> {
    return this.generationService.backfill(params.projectId) as unknown as Promise<JobEnqueueResponse>;
  }
}
