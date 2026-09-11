import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { PluginController, ProjectPluginController } from './plugin.controller';
import { PluginHost, ScopedPluginHostFactory } from './plugin-host.service';
import { PluginService } from './plugin.service';

@Module({
  imports: [DatabaseModule],
  controllers: [PluginController, ProjectPluginController],
  providers: [PluginHost, ScopedPluginHostFactory, PluginService],
  exports: [PluginHost, ScopedPluginHostFactory, PluginService],
})
export class PluginsModule {}
