import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { ChapterController } from './chapter.controller';
import { ChapterService } from './chapter.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ChapterController],
  providers: [ChapterService],
  exports: [ChapterService],
})
export class ChapterModule {}
