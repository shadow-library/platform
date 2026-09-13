import { Module } from '@shadow-library/app';

import { AdminModule } from '@server/modules/admin';
import { KeyModule } from '@server/modules/auth/keys';
import { SessionModule } from '@server/modules/auth/session';
import { AuthzModule } from '@server/modules/authz';
import { BotModule } from '@server/modules/identity/bot';
import { OrganisationModule } from '@server/modules/identity/organisation';
import { ApplicationModule } from '@server/modules/system/application';

import { AccessGuard } from './access.guard';

@Module({
  imports: [SessionModule, AdminModule, OrganisationModule, KeyModule, BotModule, AuthzModule, ApplicationModule],
  controllers: [AccessGuard],
})
export class AccessModule {}
