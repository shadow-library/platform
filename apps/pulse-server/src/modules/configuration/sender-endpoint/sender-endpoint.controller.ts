/**
 * Importing npm packages
 */
import { ApiOperation, Body, Delete, Get, HttpController, HttpStatus, Params, Patch, Post, Query, RespondFor, ServerError } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { PULSE_PERMISSIONS, RequirePermission } from '@modules/auth';
import { AppErrorCode } from '@server/classes';

import {
  CreateSenderEndpointBody,
  ListSenderEndpointResponse,
  ListSenderEndpointsQuery,
  SenderEndpointParams,
  SenderEndpointProfileParams,
  SenderEndpointResponse,
  UpdateSenderEndpointBody,
} from './sender-endpoint.dto';
import { SenderEndpointService } from './sender-endpoint.service';

/**
 * Declaring the constants
 */

@ApiOperation({ tags: ['Sender Endpoints'] })
@HttpController('/sender-profiles/:profileId/endpoints')
export class SenderEndpointController {
  constructor(private readonly senderEndpointService: SenderEndpointService) {}

  @Post()
  @RequirePermission(PULSE_PERMISSIONS.sendersWrite)
  @RespondFor(201, SenderEndpointResponse)
  createSenderEndpoint(@Params() params: SenderEndpointProfileParams, @Body() body: CreateSenderEndpointBody): Promise<SenderEndpointResponse> {
    return this.senderEndpointService.createSenderEndpoint(params.profileId, body);
  }

  @Get()
  @RequirePermission(PULSE_PERMISSIONS.sendersRead)
  @RespondFor(200, ListSenderEndpointResponse)
  listSenderEndpoints(@Params() params: SenderEndpointProfileParams, @Query() query: ListSenderEndpointsQuery): Promise<ListSenderEndpointResponse> {
    return this.senderEndpointService.listSenderEndpoints(params.profileId, query);
  }

  @Get('/:endpointId')
  @RequirePermission(PULSE_PERMISSIONS.sendersRead)
  @RespondFor(200, SenderEndpointResponse)
  async getSenderEndpoint(@Params() params: SenderEndpointParams): Promise<SenderEndpointResponse> {
    const senderEndpoint = await this.senderEndpointService.getSenderEndpoint(params.profileId, params.endpointId);
    if (!senderEndpoint) throw new ServerError(AppErrorCode.SND_EP_001);
    return senderEndpoint;
  }

  @Patch('/:endpointId')
  @RequirePermission(PULSE_PERMISSIONS.sendersWrite)
  @RespondFor(200, SenderEndpointResponse)
  updateSenderEndpoint(@Params() params: SenderEndpointParams, @Body() body: UpdateSenderEndpointBody): Promise<SenderEndpointResponse> {
    return this.senderEndpointService.updateSenderEndpoint(params.profileId, params.endpointId, body);
  }

  @Delete('/:endpointId')
  @RequirePermission(PULSE_PERMISSIONS.sendersWrite)
  @HttpStatus(204)
  deleteSenderEndpoint(@Params() params: SenderEndpointParams): Promise<void> {
    return this.senderEndpointService.deleteSenderEndpoint(params.profileId, params.endpointId);
  }
}
