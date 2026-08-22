import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { ConsolidateService } from './consolidate.service';
import { ExtractionService } from './extraction.service';

@Module({
  imports: [DatabaseModule],
  providers: [ConsolidateService, ExtractionService],
  exports: [ConsolidateService, ExtractionService],
})
export class ExtractionModule {}
