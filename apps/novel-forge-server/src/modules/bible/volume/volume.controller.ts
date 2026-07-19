/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Authenticated } from '@shadow-library/auth/module';
import { Body, Delete, Get, HttpController, HttpStatus, Params, Patch, Post, Query, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';

import { ApprovePlanResponse, CreateVolumeBody, ListVolumeResponse, ListVolumesQuery, UpdateVolumeBody, VolumeKeyParams, VolumeProjectParams, VolumeResponse } from './volume.dto';
import { VolumeService } from './volume.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Authenticated()
@HttpController('/api/v1/projects/:projectId/volumes')
export class VolumeController {
  constructor(private readonly volumeService: VolumeService) {}

  @Post('/approve')
  @RespondFor(200, ApprovePlanResponse)
  approveVolumes(@Params() params: VolumeProjectParams): Promise<ApprovePlanResponse> {
    return this.volumeService.approve(params.projectId);
  }

  @Post()
  @RespondFor(201, VolumeResponse)
  createVolume(@Params() params: VolumeProjectParams, @Body() body: CreateVolumeBody): Promise<VolumeResponse> {
    return this.volumeService.create(params.projectId, body);
  }

  @Get()
  @RespondFor(200, ListVolumeResponse)
  listVolumes(@Params() params: VolumeProjectParams, @Query() query: ListVolumesQuery): Promise<ListVolumeResponse> {
    return this.volumeService.list(params.projectId, query);
  }

  @Get('/:volumeKey')
  @RespondFor(200, VolumeResponse)
  async getVolume(@Params() params: VolumeKeyParams): Promise<VolumeResponse> {
    const volume = await this.volumeService.get(params.projectId, params.volumeKey);
    if (!volume) throw AppErrorCode.VOL_001.create();
    return volume;
  }

  @Patch('/:volumeKey')
  @RespondFor(200, VolumeResponse)
  updateVolume(@Params() params: VolumeKeyParams, @Body() body: UpdateVolumeBody): Promise<VolumeResponse> {
    return this.volumeService.update(params.projectId, params.volumeKey, body);
  }

  @Delete('/:volumeKey')
  @HttpStatus(204)
  deleteVolume(@Params() params: VolumeKeyParams): Promise<void> {
    return this.volumeService.delete(params.projectId, params.volumeKey);
  }
}
