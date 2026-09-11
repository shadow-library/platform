import { Module } from '@shadow-library/app';

import { PluginController } from './plugin.controller';
import { PluginHost } from './plugin-host.service';

@Module({
  controllers: [PluginController],
  providers: [PluginHost],
  exports: [PluginHost],
})
export class PluginsModule {}
