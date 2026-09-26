import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { AiModule } from '../ai/ai.module';
import { GenerationModule } from '../generation/generation.module';
import { JobsModule } from '../jobs/jobs.module';
import { FinalizeReviewController } from './finalize-review.controller';
import { FinalizeReviewService } from './finalize-review.service';

@Module({
  imports: [DatabaseModule, AiModule, JobsModule, GenerationModule],
  controllers: [FinalizeReviewController],
  providers: [FinalizeReviewService],
  exports: [FinalizeReviewService],
})
export class FinalizeReviewModule {}
