import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { AiModule } from '../ai/ai.module';
import { AssetService } from './asset.service';
import { ChapterController } from './chapter/chapter.controller';
import { ChapterService } from './chapter/chapter.service';
import { RecombineService } from './recombine.service';

@Module({
  imports: [DatabaseModule, AiModule],
  controllers: [ChapterController],
  providers: [ChapterService, AssetService, RecombineService],
  exports: [ChapterService, AssetService, RecombineService],
})
export class SourceModule {}
