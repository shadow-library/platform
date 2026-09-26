import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Body, Delete, Get, HttpController, HttpStatus, Params, Patch, Post, RespondFor } from '@shadow-library/fastify';

import { PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION } from '@server/constants';

import { CreateMilestoneBody, ListMilestonesResponse, MilestoneKeyParams, MilestoneProjectParams, MilestoneResponse, UpdateMilestoneBody } from './milestone.dto';
import { MilestoneService } from './milestone.service';

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects/:projectId/milestones')
export class MilestoneController {
  constructor(private readonly milestoneService: MilestoneService) {}

  @Get()
  @RespondFor(200, ListMilestonesResponse)
  async listMilestones(@Params() params: MilestoneProjectParams): Promise<ListMilestonesResponse> {
    const milestones = await this.milestoneService.list(params.projectId);
    return { milestones };
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post()
  @HttpStatus(201)
  @RespondFor(201, MilestoneResponse)
  createMilestone(@Params() params: MilestoneProjectParams, @Body() body: CreateMilestoneBody): Promise<MilestoneResponse> {
    return this.milestoneService.create(params.projectId, body);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Patch('/:milestoneKey')
  @RespondFor(200, MilestoneResponse)
  updateMilestone(@Params() params: MilestoneKeyParams, @Body() body: UpdateMilestoneBody): Promise<MilestoneResponse> {
    return this.milestoneService.update(params.projectId, params.milestoneKey, body);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Delete('/:milestoneKey')
  @HttpStatus(204)
  deleteMilestone(@Params() params: MilestoneKeyParams): Promise<void> {
    return this.milestoneService.delete(params.projectId, params.milestoneKey);
  }
}
