import { Authenticated } from '@shadow-library/auth/module';
import { Body, Get, HttpController, Params, Post, Query, RespondFor } from '@shadow-library/fastify';

import {
  IllustrationParams,
  IllustrationProjectParams,
  IllustrationResponse,
  ListIllustrationsQuery,
  ListIllustrationsResponse,
  RefineIllustrationBody,
  SaveIllustrationBody,
  SelectIllustrationBody,
  StartIllustrationBody,
} from './illustration.dto';
import { IllustrationService } from './illustration.service';

@Authenticated()
@HttpController('/api/v1/projects/:projectId/illustrations')
export class IllustrationController {
  constructor(private readonly illustrationService: IllustrationService) {}

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

  @Post('/:id/refine')
  @RespondFor(200, IllustrationResponse)
  refineIllustration(@Params() params: IllustrationParams, @Body() body: RefineIllustrationBody): Promise<IllustrationResponse> {
    return this.illustrationService.refine(params.projectId, params.id, body);
  }

  @Post('/:id/select')
  @RespondFor(200, IllustrationResponse)
  selectIllustration(@Params() params: IllustrationParams, @Body() body: SelectIllustrationBody): Promise<IllustrationResponse> {
    return this.illustrationService.select(params.projectId, params.id, body.ref);
  }

  @Post('/:id/save')
  @RespondFor(200, IllustrationResponse)
  saveIllustration(@Params() params: IllustrationParams, @Body() body: SaveIllustrationBody): Promise<IllustrationResponse> {
    return this.illustrationService.save(params.projectId, params.id, body.target);
  }

  @Post('/:id/discard')
  @RespondFor(200, IllustrationResponse)
  discardIllustration(@Params() params: IllustrationParams): Promise<IllustrationResponse> {
    return this.illustrationService.discard(params.projectId, params.id);
  }
}
