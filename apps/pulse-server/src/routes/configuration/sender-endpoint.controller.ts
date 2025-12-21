/**
 * Importing npm packages
 */
import { Body, Delete, Get, HttpController, HttpStatus, Params, Patch, Post, Query, RespondFor, ServerError } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { SenderEndpointService } from '@modules/configuration';
import { AppErrorCode } from '@server/classes';

import {
  CreateSenderEndpointBody,
  ListSenderEndpointResponse,
  ListSenderEndpointsQuery,
  SenderEndpointParams,
  SenderEndpointProfileParams,
  SenderEndpointResponse,
  UpdateSenderEndpointBody,
} from './dtos';

/**
 * Declaring the constants
 */

@HttpController('/sender-profiles/:profileId/endpoints')
export class SenderEndpointController {
  constructor(private readonly senderEndpointService: SenderEndpointService) {}

  @Post()
  @RespondFor(201, SenderEndpointResponse)
  createSenderEndpoint(@Params() params: SenderEndpointProfileParams, @Body() body: CreateSenderEndpointBody): Promise<SenderEndpointResponse> {
    return this.senderEndpointService.createSenderEndpoint(params.profileId, body);
  }

  @Get()
  @RespondFor(200, ListSenderEndpointResponse)
  listSenderEndpoints(@Params() params: SenderEndpointProfileParams, @Query() query: ListSenderEndpointsQuery): Promise<ListSenderEndpointResponse> {
    return this.senderEndpointService.listSenderEndpoints(params.profileId, query);
  }

  @Get('/:endpointId')
  @RespondFor(200, SenderEndpointResponse)
  async getSenderEndpoint(@Params() params: SenderEndpointParams): Promise<SenderEndpointResponse> {
    const senderEndpoint = await this.senderEndpointService.getSenderEndpoint(params.profileId, params.endpointId);
    if (!senderEndpoint) throw new ServerError(AppErrorCode.SND_EP_001);
    return senderEndpoint;
  }

  @Patch('/:endpointId')
  @RespondFor(200, SenderEndpointResponse)
  updateSenderEndpoint(@Params() params: SenderEndpointParams, @Body() body: UpdateSenderEndpointBody): Promise<SenderEndpointResponse> {
    return this.senderEndpointService.updateSenderEndpoint(params.profileId, params.endpointId, body);
  }

  @Delete('/:endpointId')
  @HttpStatus(204)
  deleteSenderEndpoint(@Params() params: SenderEndpointParams): Promise<void> {
    return this.senderEndpointService.deleteSenderEndpoint(params.profileId, params.endpointId);
  }
}
