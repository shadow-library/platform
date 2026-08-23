import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { SyncModule } from '@modules/sync';

import { AccountController } from './account.controller';
import { AccountService } from './account.service';

@Module({
  imports: [DatabaseModule, MemoirAuthModule, SyncModule],
  controllers: [AccountController],
  providers: [AccountService],
  exports: [AccountService],
})
export class AccountModule {}
