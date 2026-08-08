import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { AiModule } from '../ai/ai.module';
import { ConsolidateService } from './consolidate.service';
import { ExtractionService } from './extraction.service';
import { KnowledgeRepository } from './knowledge.repository';

@Module({
  imports: [DatabaseModule, AiModule],
  providers: [KnowledgeRepository, ConsolidateService, ExtractionService],
  exports: [KnowledgeRepository, ConsolidateService, ExtractionService],
})
export class ExtractionModule {}
