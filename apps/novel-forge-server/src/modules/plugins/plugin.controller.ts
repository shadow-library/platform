import { type FastifyReply } from 'fastify';
import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Body, Delete, Get, HttpController, HttpStatus, Params, Post, Put, RespondFor, Response } from '@shadow-library/fastify';

import { PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION } from '@server/constants';

import { PluginHost } from './plugin-host.service';
import { PluginProposalService } from './plugin-proposal.service';
import { EnablePluginBody, PluginAugmentResponse, PluginIdParams, PluginManifestResponse, PluginProjectParams, ProjectPluginResponse } from './plugin.dto';
import { PluginService } from './plugin.service';

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/plugins')
export class PluginController {
  constructor(private readonly pluginHost: PluginHost) {}

  @Get()
  @RespondFor(200, [PluginManifestResponse])
  listPlugins(): PluginManifestResponse[] {
    return this.pluginHost.list().map(loaded => loaded.manifest);
  }
}

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects/:projectId/plugins')
export class ProjectPluginController {
  constructor(private readonly pluginService: PluginService) {}

  @Get()
  @RespondFor(200, [ProjectPluginResponse])
  listProjectPlugins(@Params() params: PluginProjectParams): Promise<ProjectPluginResponse[]> {
    return this.pluginService.list(params.projectId);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Put('/:pluginId')
  @RespondFor(200, ProjectPluginResponse)
  enablePlugin(@Params() params: PluginIdParams, @Body() body: EnablePluginBody): Promise<ProjectPluginResponse> {
    return this.pluginService.enable(params.projectId, params.pluginId, body);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Delete('/:pluginId')
  @HttpStatus(204)
  disablePlugin(@Params() params: PluginIdParams): Promise<void> {
    return this.pluginService.disable(params.projectId, params.pluginId);
  }
}

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects/:projectId/plugins')
export class PluginAugmentController {
  constructor(private readonly pluginProposalService: PluginProposalService) {}

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/:pluginId/augment')
  @HttpStatus(200)
  @RespondFor(200, PluginAugmentResponse)
  async augment(@Params() params: PluginIdParams, @Response() reply: FastifyReply): Promise<PluginAugmentResponse | undefined> {
    const proposal = await this.pluginProposalService.augment(params.projectId, params.pluginId);
    if (!proposal) return void reply.status(204).send();
    return { proposalId: proposal.id };
  }
}
