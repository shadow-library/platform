import { Module } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { DatabaseModule, StorageModule } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { SchedulerModule } from '@modules/scheduler';

import { ReceiptController } from './receipt.controller';
import { ReceiptRepository } from './receipt.repository';
import { ReceiptService } from './receipt.service';
import { ReceiptSweepService } from './receipt-sweep.service';

/**
 * A dedicated private bucket, not the platform's shared public `storage` bucket (ADR-0008): explicit
 * `bucket` override so this never falls back to `storage.s3.bucket`'s ('storage') default, and a
 * `publicOrigin` placeholder that is never actually resolved — no public URL exists for `memoir-receipts`,
 * every read goes through `getPresignedDownloadUrl`. Endpoint/region/credentials resolve from the
 * `STORAGE_S3_*` env at `StorageService.onModuleInit`, per environment (ADR-0008 Consequences).
 */
const ReceiptStorageModule = StorageModule.forRoot({
  driver: 's3',
  publicOrigin: `https://receipts.invalid/${Config.get('storage.receipts-bucket')}`,
  s3: { bucket: Config.get('storage.receipts-bucket') },
});

@Module({
  imports: [DatabaseModule, MemoirAuthModule, SchedulerModule, ReceiptStorageModule],
  controllers: [ReceiptController],
  providers: [ReceiptRepository, ReceiptService, ReceiptSweepService],
  exports: [ReceiptRepository, ReceiptService, ReceiptSweepService],
})
export class ReceiptsModule {}
