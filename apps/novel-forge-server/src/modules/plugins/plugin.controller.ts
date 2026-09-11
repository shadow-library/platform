import { Authenticated } from '@shadow-library/auth/module';
import { Get, HttpController, RespondFor } from '@shadow-library/fastify';

import { PluginHost } from './plugin-host.service';
import { PluginManifestResponse } from './plugin.dto';

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
