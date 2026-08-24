/**
 * Importing npm packages
 */
import { Authenticated, RequireScope } from '@shadow-library/auth/module';
import { Body, Delete, Get, HttpController, HttpStatus, Params, Post, Put, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { type AiScheduledQuery, type AiTask, type AppliedSuggestion } from '@server/database';

import { AiConsentService, type AiConsentView } from './ai-consent.service';
import { AiResultService } from './ai-result.service';
import { AiScheduledQueryService } from './ai-scheduled-query.service';
import { AiTaskService } from './ai-task.service';
import {
  AiApplySuggestionDto,
  AiConsentListResponseDto,
  AiConsentUpdateDto,
  AiResultIdParams,
  AiScheduledQueryResponseDto,
  AiScheduledQueryUpsertDto,
  AiTaskIdParams,
  AiTaskResponseDto,
  AiTaskSubmitDto,
  AppliedSuggestionResponseDto,
} from './ai.dto';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/api/v1/ai')
@Authenticated()
export class AiController {
  constructor(
    private readonly aiTaskService: AiTaskService,
    private readonly aiConsentService: AiConsentService,
    private readonly aiScheduledQueryService: AiScheduledQueryService,
    private readonly aiResultService: AiResultService,
  ) {}

  @Post('/tasks')
  @RequireScope('memoir:sync')
  @RespondFor(201, AiTaskResponseDto)
  @HttpStatus(201)
  submitTask(@Body() body: AiTaskSubmitDto): Promise<AiTask.Row> {
    return this.aiTaskService.submit(body);
  }

  @Post('/tasks/:id/cancel')
  @RequireScope('memoir:sync')
  @RespondFor(200, AiTaskResponseDto)
  cancelTask(@Params() params: AiTaskIdParams): Promise<AiTask.Row> {
    return this.aiTaskService.cancel(params.id);
  }

  @Get('/consents')
  @RequireScope('memoir:account')
  @RespondFor(200, AiConsentListResponseDto)
  async getConsents(): Promise<{ consents: AiConsentView[] }> {
    return { consents: await this.aiConsentService.list() };
  }

  @Put('/consents')
  @RequireScope('memoir:account')
  @RespondFor(200, AiConsentListResponseDto)
  async putConsents(@Body() body: AiConsentUpdateDto): Promise<{ consents: AiConsentView[] }> {
    return { consents: await this.aiConsentService.update(body.grants) };
  }

  @Put('/scheduled-query')
  @RequireScope('memoir:account')
  @RespondFor(200, AiScheduledQueryResponseDto)
  putScheduledQuery(@Body() body: AiScheduledQueryUpsertDto): Promise<AiScheduledQuery.Row> {
    return this.aiScheduledQueryService.put(body);
  }

  @Delete('/scheduled-query')
  @RequireScope('memoir:account')
  @HttpStatus(204)
  removeScheduledQuery(): Promise<void> {
    return this.aiScheduledQueryService.remove();
  }

  @Post('/results/:id/apply')
  @RequireScope('memoir:sync')
  @RespondFor(200, AppliedSuggestionResponseDto)
  applySuggestion(@Params() params: AiResultIdParams, @Body() body: AiApplySuggestionDto): Promise<AppliedSuggestion.Row> {
    return this.aiResultService.apply(params.id, body.suggestionIndex);
  }
}
