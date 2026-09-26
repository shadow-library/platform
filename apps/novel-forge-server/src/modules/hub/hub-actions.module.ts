import { Module } from '@shadow-library/app';

import { GenerationModule } from '../generation/generation.module';
import { RefinementModule } from '../refinement/refinement.module';
import { ReviewModule } from '../review/review.module';
import { HubActionRegistrar } from './hub-action.registrar';

@Module({
  imports: [RefinementModule, GenerationModule, ReviewModule],
  providers: [HubActionRegistrar],
})
export class HubActionsModule {}
