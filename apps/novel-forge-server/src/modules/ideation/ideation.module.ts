import { Module } from '@shadow-library/app';
import { FastifyModule } from '@shadow-library/fastify';
import { DatabaseModule } from '@shadow-library/modules';

import { AiModule } from '../ai/ai.module';
import { ProjectModule } from '../project';
import { RefinementModule } from '../refinement/refinement.module';
import { IdeationController, SeedController } from './ideation.controller';
import { IdeationService } from './ideation.service';
import { IdeationTurnRegistrar } from './ideation-turn.registrar';

@Module({
  imports: [DatabaseModule, FastifyModule, ProjectModule, AiModule, RefinementModule],
  controllers: [SeedController, IdeationController],
  providers: [IdeationService, IdeationTurnRegistrar],
  exports: [IdeationService],
})
export class IdeationModule {}
