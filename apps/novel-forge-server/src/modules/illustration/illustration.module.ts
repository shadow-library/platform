import { Module } from '@shadow-library/app';
import { DatabaseModule, StorageModule } from '@shadow-library/modules';

import { AiModule } from '../ai/ai.module';
import { BibleModule } from '../bible/bible.module';
import { GenerationModule } from '../generation/generation.module';
import { ProjectModule } from '../project/project.module';
import { IllustrationController } from './illustration.controller';
import { IllustrationService } from './illustration.service';
import { LegacyIllustrationController } from './legacy-illustration.controller';

@Module({
  imports: [DatabaseModule, StorageModule, AiModule, BibleModule, GenerationModule, ProjectModule],
  controllers: [IllustrationController, LegacyIllustrationController],
  providers: [IllustrationService],
  exports: [IllustrationService],
})
export class IllustrationModule {}
