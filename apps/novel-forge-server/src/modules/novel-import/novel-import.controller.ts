/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Authenticated } from '@shadow-library/auth/module';
import { Body, HttpController, HttpStatus, Post, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { JobExecutor } from '../jobs/job.executor';
import { ImportNovelBody, ImportNovelResponse } from './novel-import.dto';
import { NovelImportService } from './novel-import.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

// Not nested under `/projects/:projectId` (unlike plan-import) — this endpoint CREATES the project,
// so there is nothing for `ProjectOwnershipGuard` to check yet; ownership is stamped on write from
// `ContextService`, exactly like `POST /api/v1/projects`.
@Authenticated()
@HttpController('/api/v1/import')
export class NovelImportController {
  constructor(
    private readonly novelImportService: NovelImportService,
    private readonly jobExecutor: JobExecutor,
  ) {}

  @Post()
  @HttpStatus(202)
  @RespondFor(202, ImportNovelResponse)
  async importNovel(@Body() body: ImportNovelBody): Promise<ImportNovelResponse> {
    const response = await this.novelImportService.import(body);
    // Fire-and-forget, exactly like every other job-enqueuing endpoint (PipelineController, RebrandController).
    this.jobExecutor.dispatch(response.jobId).catch(() => undefined);
    return response;
  }
}
