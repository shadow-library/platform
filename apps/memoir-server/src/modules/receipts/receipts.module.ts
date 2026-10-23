import { Module } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { DatabaseModule, StorageModule, StorageService } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { SchedulerModule } from '@modules/scheduler';

import { ReceiptController } from './receipt.controller';
import { ReceiptRepository } from './receipt.repository';
import { ReceiptService } from './receipt.service';
import { ReceiptSweepService } from './receipt-sweep.service';

/**
 * A dedicated private bucket, not the shared public `storage` bucket: the explicit `bucket` override avoids `storage.s3.bucket`'s default, and
 * `publicOrigin` is a placeholder never resolved, since every read is presigned.
 * This is the one place `memoir-receipts` is registered (`StorageModule.forRoot()` may be called once per app graph); other modules import this module instead.
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
  exports: [ReceiptRepository, ReceiptService, ReceiptSweepService, StorageService],
})
export class ReceiptsModule {}
