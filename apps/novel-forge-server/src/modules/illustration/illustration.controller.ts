/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Authenticated } from '@shadow-library/auth/module';
import { Body, HttpController, Params, Post, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
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

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Authenticated()
@HttpController('/api/v1/projects/:projectId/entities/:entityKey/illustration')
export class IllustrationController {
  constructor(private readonly illustrationService: IllustrationService) {}

  @Post('/')
  @RespondFor(200, StartIllustrationResponse)
  start(@Params() params: IllustrationParams, @Body() body: StartIllustrationBody): Promise<StartIllustrationResponse> {
    return this.illustrationService.start(BigInt(params.projectId), params.entityKey, body);
  }

  @Post('/refine')
  @RespondFor(200, RefineIllustrationResponse)
  refine(@Body() body: RefineIllustrationBody): Promise<RefineIllustrationResponse> {
    return this.illustrationService.refine(body.sessionId, body.instruction);
  }

  @Post('/save')
  @RespondFor(200, SaveIllustrationResponse)
  save(@Body() body: SaveIllustrationBody): Promise<SaveIllustrationResponse> {
    return this.illustrationService.save(body.sessionId);
  }

  @Post('/cancel')
  @RespondFor(200, CancelIllustrationResponse)
  cancel(@Body() body: CancelIllustrationBody): Promise<CancelIllustrationResponse> {
    return this.illustrationService.cancel(body.sessionId);
  }
}
