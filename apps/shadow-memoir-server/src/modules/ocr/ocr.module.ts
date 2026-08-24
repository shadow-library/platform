import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { ProgressionModule } from '@modules/progression';

import { OcrController } from './ocr.controller';
import { OcrStructuringClient, UnconfiguredOcrStructuringClient } from './ocr-structuring.client';
import { OcrService } from './ocr.service';

@Module({
  imports: [DatabaseModule, MemoirAuthModule, ProgressionModule],
  controllers: [OcrController],
  providers: [OcrService, { token: OcrStructuringClient, useClass: UnconfiguredOcrStructuringClient }],
  exports: [OcrService],
})
export class OcrModule {}
