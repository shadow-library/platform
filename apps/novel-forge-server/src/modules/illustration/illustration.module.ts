import { Module } from '@shadow-library/app';
import { DatabaseModule, StorageModule } from '@shadow-library/modules';

import { AiModule } from '../ai/ai.module';
import { IllustrationController } from './illustration.controller';
import { IllustrationService } from './illustration.service';

@Module({
  imports: [DatabaseModule, StorageModule, AiModule],
  controllers: [IllustrationController],
  providers: [IllustrationService],
  exports: [IllustrationService],
})
export class IllustrationModule {}
