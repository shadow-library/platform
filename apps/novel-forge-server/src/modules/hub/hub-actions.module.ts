import { Module } from '@shadow-library/app';

import { GenerationModule } from '../generation/generation.module';
import { RefinementModule } from '../refinement/refinement.module';
import { HubActionRegistrar } from './hub-action.registrar';

@Module({
  imports: [RefinementModule, GenerationModule],
  providers: [HubActionRegistrar],
})
export class HubActionsModule {}
