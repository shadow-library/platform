/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Body, Get, HttpController, Params, Post, Put, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { ApproveArcsResponse, ArcKeyParams, ArcResponse, ListArcResponse, UpsertArcBody, VolumeArcsParams } from './arc.dto';
import { ArcService } from './arc.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/projects/:projectId')
export class ArcController {
  constructor(private readonly arcService: ArcService) {}

  @Get('/volumes/:volumeKey/arcs')
  @RespondFor(200, ListArcResponse)
  async listArcs(@Params() params: VolumeArcsParams): Promise<ListArcResponse> {
    const arcs = await this.arcService.list(params.projectId, params.volumeKey);
    return { arcs } as unknown as ListArcResponse;
  }

  @Post('/volumes/:volumeKey/arcs/approve')
  @RespondFor(200, ApproveArcsResponse)
  approveArcs(@Params() params: VolumeArcsParams): Promise<ApproveArcsResponse> {
    return this.arcService.approve(params.projectId, params.volumeKey);
  }

  @Get('/arcs/:arcKey')
  @RespondFor(200, ArcResponse)
  getArc(@Params() params: ArcKeyParams): Promise<ArcResponse> {
    return this.arcService.get(params.projectId, params.arcKey) as unknown as Promise<ArcResponse>;
  }

  @Put('/arcs/:arcKey')
  @RespondFor(200, ArcResponse)
  upsertArc(@Params() params: ArcKeyParams, @Body() body: UpsertArcBody): Promise<ArcResponse> {
    return this.arcService.upsert(params.projectId, params.arcKey, body) as unknown as Promise<ArcResponse>;
  }
}
