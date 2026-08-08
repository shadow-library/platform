import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { AiModule } from '../ai/ai.module';
import { RebrandService } from './rebrand.service';

// No JobsModule import here — JobsModule imports THIS module for the executor, and the rebrand
// controller lives in PipelineModule (the HTTP-wiring seam), keeping the module graph acyclic.
@Module({
  imports: [DatabaseModule, AiModule],
  providers: [RebrandService],
  exports: [RebrandService],
})
export class RebrandModule {}
