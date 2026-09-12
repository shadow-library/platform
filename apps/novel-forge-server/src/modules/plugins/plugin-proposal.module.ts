import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { RefinementModule } from '../refinement/refinement.module';
import { PluginAugmentController } from './plugin.controller';
import { PluginProposalService } from './plugin-proposal.service';
import { PluginsModule } from './plugins.module';

// Kept out of `PluginsModule` because the proposal flow lives in `RefinementModule`, which imports the
// plugin host for its own policy resolution — this module is the one-way edge that keeps the two apart.
@Module({
  imports: [DatabaseModule, PluginsModule, RefinementModule],
  controllers: [PluginAugmentController],
  providers: [PluginProposalService],
  exports: [PluginProposalService],
})
export class PluginProposalModule {}
