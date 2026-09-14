import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Body, Delete, Get, HttpController, type HttpResponse, HttpStatus, Params, Patch, Post, Put, Query, Res, RespondFor } from '@shadow-library/fastify';

import { GENERATION_RUN_PERMISSION, PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION } from '@server/constants';

import { JobExecutor } from '../jobs/job.executor';
import { JobService } from '../jobs/job.service';
import { JobEnqueueResponse } from '../pipeline/pipeline.dto';
import {
  ApproveTranslationTermBody,
  CreateTranslationTermBody,
  EditTranslationBody,
  FinalizeChapterResponse,
  OriginalChapterBody,
  OriginalChapterResponse,
  TranslationChapterDetailResponse,
  TranslationChapterListQuery,
  TranslationChapterListResponse,
  TranslationChapterParams,
  TranslationConfigBody,
  TranslationGlossaryListResponse,
  TranslationGlossaryQuery,
  TranslationManuscriptResponse,
  TranslationParams,
  TranslationResponse,
  TranslationStartBody,
  TranslationStatusResponse,
  TranslationTermDecisionsBody,
  TranslationTermDecisionsResponse,
  TranslationTermParams,
  TranslationTermResponse,
  UpdateTranslationTermBody,
} from './translation.dto';
import { TranslationService } from './translation.service';

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects/:projectId/translation')
export class TranslationController {
  constructor(
    private readonly translationService: TranslationService,
    private readonly jobService: JobService,
    private readonly jobExecutor: JobExecutor,
  ) {}

  @Get()
  @RespondFor(200, TranslationStatusResponse)
  async getTranslationStatus(@Params() params: TranslationParams): Promise<TranslationStatusResponse> {
    const [status, jobs] = await Promise.all([this.translationService.status(params.projectId), this.jobService.listByProject(params.projectId)]);
    return { ...status, job: jobs.find(job => job.kind === 'translate') ?? null };
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Put('/config')
  @RespondFor(200, TranslationResponse)
  updateConfig(@Params() params: TranslationParams, @Body() body: TranslationConfigBody): Promise<TranslationResponse> {
    return this.translationService.updateConfig(params.projectId, body);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Put('/originals/:chapter')
  @HttpStatus(201)
  async upsertOriginal(@Params() params: TranslationChapterParams, @Body() body: OriginalChapterBody, @Res() res: HttpResponse): Promise<void> {
    const { outcome } = await this.translationService.upsertOriginal(params.projectId, params.chapter, body);
    if (outcome === 'updated') res.status(200);
    if (outcome === 'unchanged') res.status(204);
  }

  @Get('/originals/:chapter')
  @RespondFor(200, OriginalChapterResponse)
  getOriginal(@Params() params: TranslationChapterParams): Promise<OriginalChapterResponse> {
    return this.translationService.getOriginal(params.projectId, params.chapter);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Delete('/originals/:chapter')
  @HttpStatus(204)
  deleteOriginal(@Params() params: TranslationChapterParams): Promise<void> {
    return this.translationService.deleteOriginal(params.projectId, params.chapter);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @BotPermission(GENERATION_RUN_PERMISSION)
  @Post()
  @HttpStatus(202)
  @RespondFor(202, JobEnqueueResponse)
  async startTranslation(@Params() params: TranslationParams, @Body() body: TranslationStartBody): Promise<JobEnqueueResponse> {
    const { projectId } = params;
    // The kind guard runs before enqueue so a non-translation project 400s instead of parking a job.
    await this.translationService.getOrCreate(projectId);
    const target = `translate-${projectId}`;
    const jobId = await this.jobService.enqueue(projectId, 'translate', target, { chapters: body.chapters, force: body.force, limit: body.limit, stale: body.stale });
    this.jobExecutor.dispatch(jobId).catch(() => undefined);
    return { jobId, kind: 'translate', status: 'pending', target };
  }

  @Get('/chapters')
  @RespondFor(200, TranslationChapterListResponse)
  listChapters(@Params() params: TranslationParams, @Query() query: TranslationChapterListQuery): Promise<TranslationChapterListResponse> {
    return this.translationService.listChapters(params.projectId, query);
  }

  @Get('/chapters/:chapter')
  @RespondFor(200, TranslationChapterDetailResponse)
  getChapter(@Params() params: TranslationChapterParams): Promise<TranslationChapterDetailResponse> {
    return this.translationService.getChapter(params.projectId, params.chapter);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Put('/chapters/:chapter')
  @RespondFor(200, TranslationChapterDetailResponse)
  async editChapter(@Params() params: TranslationChapterParams, @Body() body: EditTranslationBody): Promise<TranslationChapterDetailResponse> {
    await this.translationService.editTranslation(params.projectId, params.chapter, body);
    return this.translationService.getChapter(params.projectId, params.chapter);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @BotPermission(GENERATION_RUN_PERMISSION)
  @Post('/chapters/:chapter')
  @HttpStatus(202)
  @RespondFor(202, JobEnqueueResponse)
  async rerunChapter(@Params() params: TranslationChapterParams): Promise<JobEnqueueResponse> {
    const { projectId, chapter } = params;
    await this.translationService.assertRerunnable(projectId, chapter);
    // A distinct target lets a single-chapter re-run coexist with the full job under the unique
    // (projectId, kind, target) index; the per-project concurrency lock serialises the two.
    const target = `translate-${projectId}-ch-${chapter}`;
    const jobId = await this.jobService.enqueue(projectId, 'translate', target, { chapters: [chapter], force: true });
    this.jobExecutor.dispatch(jobId).catch(() => undefined);
    return { jobId, kind: 'translate', status: 'pending', target };
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/chapters/:chapter/finalize')
  @RespondFor(200, FinalizeChapterResponse)
  finalizeChapter(@Params() params: TranslationChapterParams): Promise<FinalizeChapterResponse> {
    return this.translationService.finalize(params.projectId, params.chapter);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/chapters/:chapter/reopen')
  @RespondFor(200, TranslationChapterDetailResponse)
  async reopenChapter(@Params() params: TranslationChapterParams): Promise<TranslationChapterDetailResponse> {
    await this.translationService.reopen(params.projectId, params.chapter);
    return this.translationService.getChapter(params.projectId, params.chapter);
  }

  @Get('/glossary')
  @RespondFor(200, TranslationGlossaryListResponse)
  listGlossary(@Params() params: TranslationParams, @Query() query: TranslationGlossaryQuery): Promise<TranslationGlossaryListResponse> {
    return this.translationService.listGlossary(params.projectId, query);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/glossary')
  @HttpStatus(201)
  @RespondFor(201, TranslationTermResponse)
  createTerm(@Params() params: TranslationParams, @Body() body: CreateTranslationTermBody): Promise<TranslationTermResponse> {
    return this.translationService.createTerm(params.projectId, body);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Patch('/glossary/:id')
  @RespondFor(200, TranslationTermResponse)
  updateTerm(@Params() params: TranslationTermParams, @Body() body: UpdateTranslationTermBody): Promise<TranslationTermResponse> {
    return this.translationService.updateTerm(params.projectId, params.id, body);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/glossary/:id/approve')
  @RespondFor(200, TranslationTermResponse)
  approveTerm(@Params() params: TranslationTermParams, @Body() body: ApproveTranslationTermBody): Promise<TranslationTermResponse> {
    return this.translationService.approveTerm(params.projectId, params.id, body);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/glossary/:id/reject')
  @RespondFor(200, TranslationTermResponse)
  rejectTerm(@Params() params: TranslationTermParams): Promise<TranslationTermResponse> {
    return this.translationService.rejectTerm(params.projectId, params.id);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/glossary/decisions')
  @RespondFor(200, TranslationTermDecisionsResponse)
  decideTerms(@Params() params: TranslationParams, @Body() body: TranslationTermDecisionsBody): Promise<TranslationTermDecisionsResponse> {
    return this.translationService.decideTerms(params.projectId, body.decisions);
  }

  @Get('/manuscript')
  @RespondFor(200, TranslationManuscriptResponse)
  getManuscript(@Params() params: TranslationParams): Promise<TranslationManuscriptResponse> {
    return this.translationService.renderManuscript(params.projectId);
  }
}
