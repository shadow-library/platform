import { Module } from '@shadow-library/app';

import { BibleAuditModule } from '../audit/bible-audit.module';
import { GenerationModule } from '../generation/generation.module';
import { ActionRegistryModule } from '../refinement/action-registry.module';
import { RefinementModule } from '../refinement/refinement.module';
import { ReviewModule } from '../review/review.module';
import { HubActionRegistrar } from './hub-action.registrar';

@Module({
  imports: [ActionRegistryModule, RefinementModule, GenerationModule, ReviewModule, BibleAuditModule],
  providers: [HubActionRegistrar],
})
export class HubActionsModule {}
