import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { AiModule } from '../ai/ai.module';
import { PluginsModule } from '../plugins/plugins.module';
import { RefinementModule } from '../refinement/refinement.module';
import { BlueprintRoundRunner } from './engine/blueprint-round.runner';
import { BlueprintRoundService } from './engine/blueprint-round.service';
import { BlueprintStepRegistry } from './engine/blueprint-step.registry';
import { BlueprintStepService } from './engine/blueprint-step.service';
import { LedgerController } from './ledger/ledger.controller';
import { LedgerService } from './ledger/ledger.service';
import { BLUEPRINT_STEP_REGISTRY } from './steps/blueprint-steps';

@Module({
  imports: [DatabaseModule, AiModule, PluginsModule, RefinementModule],
  controllers: [LedgerController],
  providers: [{ token: BlueprintStepRegistry, useFactory: () => BLUEPRINT_STEP_REGISTRY }, LedgerService, BlueprintRoundService, BlueprintStepService, BlueprintRoundRunner],
  exports: [LedgerService, BlueprintRoundService, BlueprintStepService, BlueprintRoundRunner, BlueprintStepRegistry],
})
export class BlueprintModule {}
