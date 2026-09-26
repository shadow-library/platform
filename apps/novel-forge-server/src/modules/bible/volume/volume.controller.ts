import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Get, HttpController, Params, Post, Query, RespondFor } from '@shadow-library/fastify';

import { AppErrorCode } from '@server/classes';
import { PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION } from '@server/constants';

import { ListVolumeResponse, ListVolumesQuery, VolumeAdvanceResponse, VolumeKeyParams, VolumeProjectParams, VolumeResponse } from './volume.dto';
import { VolumeService } from './volume.service';

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects/:projectId/volumes')
export class VolumeController {
  constructor(private readonly volumeService: VolumeService) {}

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

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/:volumeKey/goal-met')
  @RespondFor(200, VolumeAdvanceResponse)
  goalMet(@Params() params: VolumeKeyParams): Promise<VolumeAdvanceResponse> {
    return this.volumeService.advanceGoalMet(params.projectId, params.volumeKey);
  }
}
