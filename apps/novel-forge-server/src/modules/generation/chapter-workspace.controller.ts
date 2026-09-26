import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Body, Get, HttpController, HttpStatus, Params, Post, Query, RespondFor } from '@shadow-library/fastify';

import { GENERATION_RUN_PERMISSION, PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION } from '@server/constants';

import {
  AppliedPassageResponse,
  ApplyPassageBody,
  CompareVersionsQuery,
  ListDraftVersionResponse,
  ListPassageSuggestionResponse,
  PassageRequestBody,
  PassageSuggestionResponse,
  RestoreVersionBody,
  SuggestionParams,
  VersionComparisonResponse,
} from './chapter-workspace.dto';
import { draftBaseOf } from './draft-save';
import { DraftVersionService } from './draft-versions.service';
import { ChapterParams, DraftConflictResponse, DraftResponse, RevisionParams } from './generation.dto';
import { PassageRewriteService } from './passage-rewrite.service';

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects/:projectId/drafts/:n')
export class ChapterWorkspaceController {
  constructor(
    private readonly versions: DraftVersionService,
    private readonly passages: PassageRewriteService,
  ) {}

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

  @Get('/passage-suggestions')
  @RespondFor(200, ListPassageSuggestionResponse)
  async listSuggestions(@Params() params: ChapterParams): Promise<ListPassageSuggestionResponse> {
    return { items: await this.passages.list(params.projectId, params.n) };
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @BotPermission(GENERATION_RUN_PERMISSION)
  @Post('/passage-suggestions')
  @HttpStatus(201)
  @RespondFor(201, PassageSuggestionResponse)
  @RespondFor(409, DraftConflictResponse)
  requestSuggestion(@Params() params: ChapterParams, @Body() body: PassageRequestBody): Promise<PassageSuggestionResponse> {
    const base = { draftId: body.baseDraftId, revision: body.baseRevision, saveSeq: body.baseSaveSeq };
    return this.passages.request(params.projectId, params.n, { base, start: body.start, end: body.end, passageHash: body.passageHash, request: body.request });
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/passage-suggestions/:suggestionId/apply')
  @RespondFor(200, AppliedPassageResponse)
  @RespondFor(409, DraftConflictResponse)
  applySuggestion(@Params() params: SuggestionParams, @Body() body: ApplyPassageBody): Promise<AppliedPassageResponse> {
    return this.passages.apply(params.projectId, params.n, params.suggestionId, draftBaseOf(body));
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/passage-suggestions/:suggestionId/dismiss')
  @RespondFor(200, PassageSuggestionResponse)
  dismissSuggestion(@Params() params: SuggestionParams): Promise<PassageSuggestionResponse> {
    return this.passages.dismiss(params.projectId, params.n, params.suggestionId);
  }
}
