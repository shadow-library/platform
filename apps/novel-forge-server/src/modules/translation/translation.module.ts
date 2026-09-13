import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { AiModule } from '../ai/ai.module';
import { PluginsModule } from '../plugins/plugins.module';
import { TranslationService } from './translation.service';

// No JobsModule import here — JobsModule imports THIS module for the executor, the translation
// controller lives in PipelineModule and the originals ingest controller in CuratedIngestModule
// (the HTTP-wiring seams), keeping the module graph acyclic.
@Module({
  imports: [DatabaseModule, AiModule, PluginsModule],
  providers: [TranslationService],
  exports: [TranslationService],
})
export class TranslationModule {}
