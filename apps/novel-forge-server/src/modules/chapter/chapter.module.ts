import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { ChapterSearchService } from './chapter-search.service';
import { ChapterController } from './chapter.controller';
import { ChapterService } from './chapter.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ChapterController],
  providers: [ChapterService, ChapterSearchService],
})
export class ChapterModule {}
