import { Module } from '@shadow-library/app';
import { FastifyModule } from '@shadow-library/fastify';
import { DatabaseModule } from '@shadow-library/modules';

import { ActorModule } from '@modules/actor';

import { AiModule } from '../ai/ai.module';
import { BibleModule } from '../bible/bible.module';
import { EventsModule } from '../events/events.module';
import { PluginsModule } from '../plugins/plugins.module';
import { ProjectModule } from '../project';
import { RefinementModule } from '../refinement/refinement.module';
import { GraduationService } from './graduation.service';
import { IdeaNamingService } from './idea-naming.service';
import { IdeationController, SeedController } from './ideation.controller';
import { IdeationService } from './ideation.service';
import { IdeationActionRegistrar } from './ideation-action.registrar';
import { IdeationTurnRegistrar } from './ideation-turn.registrar';

@Module({
  imports: [ActorModule, DatabaseModule, FastifyModule, ProjectModule, AiModule, EventsModule, PluginsModule, RefinementModule, BibleModule],
  controllers: [SeedController, IdeationController],
  providers: [IdeationService, IdeaNamingService, GraduationService, IdeationTurnRegistrar, IdeationActionRegistrar],
  exports: [IdeationService, IdeaNamingService, GraduationService],
})
export class IdeationModule {}
