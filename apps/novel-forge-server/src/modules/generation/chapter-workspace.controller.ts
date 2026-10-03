import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Body, Get, HttpController, Params, Post, Query, RespondFor } from '@shadow-library/fastify';

import { PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION } from '@server/constants';

import { CompareVersionsQuery, ListDraftVersionResponse, RestoreVersionBody, VersionComparisonResponse } from './chapter-workspace.dto';
import { draftBaseOf } from './draft-save';
import { DraftVersionService } from './draft-versions.service';
import { ChapterParams, DraftConflictResponse, DraftResponse, RevisionParams } from './generation.dto';

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects/:projectId/drafts/:n')
export class ChapterWorkspaceController {
  constructor(private readonly versions: DraftVersionService) {}

  @Get('/versions')
  @RespondFor(200, ListDraftVersionResponse)
  async listVersions(@Params() params: ChapterParams): Promise<ListDraftVersionResponse> {
    return { items: await this.versions.list(params.projectId, params.n) };
  }

  @Get('/versions/compare')
  @RespondFor(200, VersionComparisonResponse)
  compareVersions(@Params() params: ChapterParams, @Query() query: CompareVersionsQuery): Promise<VersionComparisonResponse> {
    return this.versions.compare(params.projectId, params.n, query.from, query.to);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/versions/:r/restore')
  @RespondFor(200, DraftResponse)
  @RespondFor(409, DraftConflictResponse)
  restoreVersion(@Params() params: RevisionParams, @Body() body: RestoreVersionBody): Promise<DraftResponse> {
    return this.versions.restore(params.projectId, params.n, params.r, draftBaseOf(body));
  }
}
