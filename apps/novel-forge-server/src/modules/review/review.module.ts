import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { AiModule } from '../ai/ai.module';
import { JobsModule } from '../jobs/jobs.module';
import { PluginsModule } from '../plugins/plugins.module';
import { ChapterReviewController } from './chapter-review.controller';
import { ChapterReviewService } from './chapter-review.service';

@Module({
  imports: [DatabaseModule, AiModule, JobsModule, PluginsModule],
  controllers: [ChapterReviewController],
  providers: [ChapterReviewService],
  exports: [ChapterReviewService],
})
export class ReviewModule {}
