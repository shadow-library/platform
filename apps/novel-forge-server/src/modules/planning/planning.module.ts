import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { AiModule } from '../ai/ai.module';
import { SkeletonService } from './skeleton.service';

@Module({
  imports: [DatabaseModule, AiModule],
  providers: [SkeletonService],
  exports: [SkeletonService],
})
export class PlanningModule {}
