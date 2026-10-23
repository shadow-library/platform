import { Module } from '@shadow-library/app';
import { DatabaseModule, StorageModule } from '@shadow-library/modules';

import { AiModule } from '../ai/ai.module';
import { BibleModule } from '../bible/bible.module';
import { GenerationModule } from '../generation/generation.module';
import { PluginsModule } from '../plugins/plugins.module';
import { ProjectModule } from '../project/project.module';
import { IllustrationController } from './illustration.controller';
import { IllustrationReferenceService } from './illustration-reference.service';
import { IllustrationService } from './illustration.service';

@Module({
  imports: [DatabaseModule, StorageModule, AiModule, BibleModule, GenerationModule, PluginsModule, ProjectModule],
  controllers: [IllustrationController],
  providers: [IllustrationService, IllustrationReferenceService],
  exports: [IllustrationService, IllustrationReferenceService],
})
export class IllustrationModule {}
