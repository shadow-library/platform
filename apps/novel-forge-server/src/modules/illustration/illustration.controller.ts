/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Body, HttpController, Params, Post } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { CancelIllustrationBody, IllustrationParams, RefineIllustrationBody, SaveIllustrationBody, StartIllustrationBody } from './illustration.dto';
import { IllustrationService } from './illustration.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/projects/:projectId/entities/:entityKey/illustration')
export class IllustrationController {
  constructor(private readonly illustrationService: IllustrationService) {}

  @Post('/')
  start(@Params() params: IllustrationParams, @Body() body: StartIllustrationBody): Promise<{ sessionId: string; previewUrl: string }> {
    return this.illustrationService.start(BigInt(params.projectId), params.entityKey, body);
  }

  @Post('/refine')
  refine(@Body() body: RefineIllustrationBody): Promise<{ previewUrl: string }> {
    return this.illustrationService.refine(body.sessionId, body.instruction);
  }

  @Post('/save')
  save(@Body() body: SaveIllustrationBody): Promise<{ saved: boolean; imagePath: string }> {
    return this.illustrationService.save(body.sessionId);
  }

  @Post('/cancel')
  cancel(@Body() body: CancelIllustrationBody): Promise<{ cancelled: boolean }> {
    return this.illustrationService.cancel(body.sessionId);
  }
}
