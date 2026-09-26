import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { AiModule } from '../ai/ai.module';
import { EventsModule } from '../events/events.module';
import { GenerationModule } from '../generation/generation.module';
import { JobHandlerRegistryModule } from '../jobs/job-handler-registry.module';
import { JobsModule } from '../jobs/jobs.module';
import { PluginsModule } from '../plugins/plugins.module';
import { ActionRegistryModule } from '../refinement/action-registry.module';
import { RefinementModule } from '../refinement/refinement.module';
import { ActionJobService } from './action-job.service';
import { ChatJobReader } from './chat-job.reader';
import { ChatJobService } from './chat-job.service';
import { ChapterPlanService } from './chapter-plan.service';
import { ChatJobsController } from './chat-jobs.controller';
import { OrganiseJobService } from './organise-job.service';
import { PlanJobService } from './plan-job.service';

@Module({
  imports: [ActionRegistryModule, DatabaseModule, AiModule, EventsModule, GenerationModule, JobHandlerRegistryModule, JobsModule, PluginsModule, RefinementModule],
  controllers: [ChatJobsController],
  providers: [ActionJobService, ChapterPlanService, OrganiseJobService, PlanJobService, ChatJobReader, ChatJobService],
  exports: [ActionJobService],
})
export class ActionJobsModule {}
