import { Authenticated } from '@shadow-library/auth/module';
import { Body, Delete, Get, HttpController, HttpStatus, Params, Put, RespondFor } from '@shadow-library/fastify';

import { PluginHost } from './plugin-host.service';
import { EnablePluginBody, PluginIdParams, PluginManifestResponse, PluginProjectParams, ProjectPluginResponse } from './plugin.dto';
import { PluginService } from './plugin.service';

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

@Authenticated()
@HttpController('/api/v1/projects/:projectId/plugins')
export class ProjectPluginController {
  constructor(private readonly pluginService: PluginService) {}

  @Get()
  @RespondFor(200, [ProjectPluginResponse])
  listProjectPlugins(@Params() params: PluginProjectParams): Promise<ProjectPluginResponse[]> {
    return this.pluginService.list(params.projectId);
  }

  @Put('/:pluginId')
  @RespondFor(200, ProjectPluginResponse)
  enablePlugin(@Params() params: PluginIdParams, @Body() body: EnablePluginBody): Promise<ProjectPluginResponse> {
    return this.pluginService.enable(params.projectId, params.pluginId, body);
  }

  @Delete('/:pluginId')
  @HttpStatus(204)
  disablePlugin(@Params() params: PluginIdParams): Promise<void> {
    return this.pluginService.disable(params.projectId, params.pluginId);
  }
}
