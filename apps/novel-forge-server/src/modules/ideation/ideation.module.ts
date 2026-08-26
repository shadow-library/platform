import { Module } from '@shadow-library/app';
import { FastifyModule } from '@shadow-library/fastify';
import { DatabaseModule } from '@shadow-library/modules';

import { AiModule } from '../ai/ai.module';
import { BibleModule } from '../bible/bible.module';
import { ProjectModule } from '../project';
import { RefinementModule } from '../refinement/refinement.module';
import { GraduationService } from './graduation.service';
import { IdeationController, SeedController } from './ideation.controller';
import { IdeationService } from './ideation.service';
import { IdeationActionRegistrar } from './ideation-action.registrar';
import { IdeationTurnRegistrar } from './ideation-turn.registrar';

@Module({
  imports: [DatabaseModule, FastifyModule, ProjectModule, AiModule, RefinementModule, BibleModule],
  controllers: [SeedController, IdeationController],
  providers: [IdeationService, GraduationService, IdeationTurnRegistrar, IdeationActionRegistrar],
  exports: [IdeationService, GraduationService],
})
export class IdeationModule {}
