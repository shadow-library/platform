import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Body, Get, HttpController, Params, Post, Put, Query, RespondFor } from '@shadow-library/fastify';

import { GENERATION_RUN_PERMISSION, ILLUSTRATIONS_WRITE_PERMISSION, PROJECTS_READ_PERMISSION } from '@server/constants';

import {
  IllustrationParams,
  IllustrationProjectParams,
  IllustrationResponse,
  ListIllustrationsQuery,
  ListIllustrationsResponse,
  ReferenceOptionsQuery,
  ReferenceOptionsResponse,
  RefineIllustrationBody,
  SaveIllustrationBody,
  SelectIllustrationBody,
  StartIllustrationBody,
  UpdateIllustrationReferencesBody,
} from './illustration.dto';
import { IllustrationService } from './illustration.service';

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects/:projectId/illustrations')
export class IllustrationController {
  constructor(private readonly illustrationService: IllustrationService) {}

  @BotPermission(ILLUSTRATIONS_WRITE_PERMISSION)
  @BotPermission(GENERATION_RUN_PERMISSION)
  @Post()
  @RespondFor(201, IllustrationResponse)
  startIllustration(@Params() params: IllustrationProjectParams, @Body() body: StartIllustrationBody): Promise<IllustrationResponse> {
    return this.illustrationService.start(params.projectId, body);
  }

  @Get()
  @RespondFor(200, ListIllustrationsResponse)
  async listIllustrations(@Params() params: IllustrationProjectParams, @Query() query: ListIllustrationsQuery): Promise<ListIllustrationsResponse> {
    return { items: await this.illustrationService.list(params.projectId, query) };
  }

  @Get('/reference-options')
  @RespondFor(200, ReferenceOptionsResponse)
  listReferenceOptions(@Params() params: IllustrationProjectParams, @Query() query: ReferenceOptionsQuery): Promise<ReferenceOptionsResponse> {
    return this.illustrationService.referenceOptions(params.projectId, query);
  }

  @BotPermission(ILLUSTRATIONS_WRITE_PERMISSION)
  @Put('/:id/references')
  @RespondFor(200, IllustrationResponse)
  updateIllustrationReferences(@Params() params: IllustrationParams, @Body() body: UpdateIllustrationReferencesBody): Promise<IllustrationResponse> {
    return this.illustrationService.updateReferences(params.projectId, params.id, body);
  }

  @BotPermission(ILLUSTRATIONS_WRITE_PERMISSION)
  @BotPermission(GENERATION_RUN_PERMISSION)
  @Post('/:id/refine')
  @RespondFor(200, IllustrationResponse)
  refineIllustration(@Params() params: IllustrationParams, @Body() body: RefineIllustrationBody): Promise<IllustrationResponse> {
    return this.illustrationService.refine(params.projectId, params.id, body);
  }

  @BotPermission(ILLUSTRATIONS_WRITE_PERMISSION)
  @Post('/:id/select')
  @RespondFor(200, IllustrationResponse)
  selectIllustration(@Params() params: IllustrationParams, @Body() body: SelectIllustrationBody): Promise<IllustrationResponse> {
    return this.illustrationService.select(params.projectId, params.id, body.ref);
  }

  @BotPermission(ILLUSTRATIONS_WRITE_PERMISSION)
  @Post('/:id/save')
  @RespondFor(200, IllustrationResponse)
  saveIllustration(@Params() params: IllustrationParams, @Body() body: SaveIllustrationBody): Promise<IllustrationResponse> {
    return this.illustrationService.save(params.projectId, params.id, body.target);
  }

  @BotPermission(ILLUSTRATIONS_WRITE_PERMISSION)
  @Post('/:id/discard')
  @RespondFor(200, IllustrationResponse)
  discardIllustration(@Params() params: IllustrationParams): Promise<IllustrationResponse> {
    return this.illustrationService.discard(params.projectId, params.id);
  }
}
