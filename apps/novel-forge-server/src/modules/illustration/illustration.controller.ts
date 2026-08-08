import { Authenticated } from '@shadow-library/auth/module';
import { Body, HttpController, Params, Post, RespondFor } from '@shadow-library/fastify';

import {
  CancelIllustrationBody,
  CancelIllustrationResponse,
  IllustrationParams,
  RefineIllustrationBody,
  RefineIllustrationResponse,
  SaveIllustrationBody,
  SaveIllustrationResponse,
  StartIllustrationBody,
  StartIllustrationResponse,
} from './illustration.dto';
import { IllustrationService } from './illustration.service';

@Authenticated()
@HttpController('/api/v1/projects/:projectId/entities/:entityKey/illustration')
export class IllustrationController {
  constructor(private readonly illustrationService: IllustrationService) {}

  @Post('/')
  @RespondFor(200, StartIllustrationResponse)
  startIllustration(@Params() params: IllustrationParams, @Body() body: StartIllustrationBody): Promise<StartIllustrationResponse> {
    return this.illustrationService.start(params.projectId, params.entityKey, body);
  }

  @Post('/refine')
  @RespondFor(200, RefineIllustrationResponse)
  refineIllustration(@Body() body: RefineIllustrationBody): Promise<RefineIllustrationResponse> {
    return this.illustrationService.refine(body.sessionId, body.instruction);
  }

  @Post('/save')
  @RespondFor(200, SaveIllustrationResponse)
  saveIllustration(@Body() body: SaveIllustrationBody): Promise<SaveIllustrationResponse> {
    return this.illustrationService.save(body.sessionId);
  }

  @Post('/cancel')
  @RespondFor(200, CancelIllustrationResponse)
  cancelIllustration(@Body() body: CancelIllustrationBody): Promise<CancelIllustrationResponse> {
    return this.illustrationService.cancel(body.sessionId);
  }
}
