import { Module } from '@shadow-library/app';

import { AdminModule } from '@server/modules/admin';

import { AccountCloseController } from './account-close.controller';

@Module({
  imports: [AdminModule],
  controllers: [AccountCloseController],
})
export class AccountCloseModule {}
