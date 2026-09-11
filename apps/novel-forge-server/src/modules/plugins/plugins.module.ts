import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { PluginController, ProjectPluginController } from './plugin.controller';
import { PluginHost, ScopedPluginHostFactory } from './plugin-host.service';
import { PluginPolicyService } from './plugin-policy.service';
import { PluginService } from './plugin.service';

@Module({
  imports: [DatabaseModule],
  controllers: [PluginController, ProjectPluginController],
  providers: [PluginHost, ScopedPluginHostFactory, PluginService, PluginPolicyService],
  exports: [PluginHost, ScopedPluginHostFactory, PluginService, PluginPolicyService],
})
export class PluginsModule {}
