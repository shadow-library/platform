import { Module } from '@shadow-library/app';
import { AuthModule } from '@shadow-library/auth/module';
import { FastifyModule } from '@shadow-library/fastify';
import { DatabaseModule, StorageModule } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { SchedulerModule } from '@modules/scheduler';
import { DatastoreModule } from '@server/database';

import { DeletionController } from './deletion.controller';
import { DeletionRepository } from './deletion.repository';
import { DeletionService } from './deletion.service';
import { DeletionSweepService } from './deletion-sweep.service';
import { HttpIdentityCloseClient, IdentityCloseClient } from './identity-close.client';

/**
 * `AuthModule` and `StorageModule` are imported as bare classes, not second `forRoot` calls: a dynamic
 * module may be configured once per application graph, and `MemoirAuthModule`/`ReceiptsModule` already
 * bind them. Sharing the storage registration is also what keeps step 3's prefix wipe and the receipt
 * upload path from drifting onto different endpoints or credentials.
 */
@Module({
  imports: [AuthModule, DatabaseModule, DatastoreModule, FastifyModule, MemoirAuthModule, SchedulerModule, StorageModule],
  controllers: [DeletionController],
  providers: [DeletionRepository, DeletionService, DeletionSweepService, { token: IdentityCloseClient, useClass: HttpIdentityCloseClient }],
  exports: [DeletionRepository, DeletionService, DeletionSweepService],
})
export class DeletionModule {}
