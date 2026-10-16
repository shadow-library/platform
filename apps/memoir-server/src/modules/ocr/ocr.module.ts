import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { BillingModule } from '@modules/billing';
import { InferenceModule } from '@modules/inference';
import { ProgressionModule } from '@modules/progression';

import { OcrController } from './ocr.controller';
import { OcrStructuringClient } from './ocr-structuring.client';
import { OcrService } from './ocr.service';
import { SynapseOcrStructuringClient } from './synapse-structuring.client';

@Module({
  imports: [DatabaseModule, MemoirAuthModule, ProgressionModule, InferenceModule, BillingModule],
  controllers: [OcrController],
  providers: [OcrService, { token: OcrStructuringClient, useClass: SynapseOcrStructuringClient }],
  exports: [OcrService],
})
export class OcrModule {}
