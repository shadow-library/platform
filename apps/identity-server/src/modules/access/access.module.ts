import { Module } from '@shadow-library/app';

import { AdminModule } from '@server/modules/admin';
import { KeyModule } from '@server/modules/auth/keys';
import { SessionModule } from '@server/modules/auth/session';
import { OrganisationModule } from '@server/modules/identity/organisation';

import { AccessGuard } from './access.guard';

@Module({
  imports: [SessionModule, AdminModule, OrganisationModule, KeyModule],
  controllers: [AccessGuard],
})
export class AccessModule {}
