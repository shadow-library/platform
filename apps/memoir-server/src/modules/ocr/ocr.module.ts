import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { InferenceModule } from '@modules/inference';
import { ProgressionModule } from '@modules/progression';

import { InClusterOcrStructuringClient } from './in-cluster-structuring.client';
import { OcrController } from './ocr.controller';
import { OcrStructuringClient } from './ocr-structuring.client';
import { OcrService } from './ocr.service';

@Module({
  imports: [DatabaseModule, MemoirAuthModule, ProgressionModule, InferenceModule],
  controllers: [OcrController],
  providers: [OcrService, { token: OcrStructuringClient, useClass: InClusterOcrStructuringClient }],
  exports: [OcrService],
})
export class OcrModule {}
