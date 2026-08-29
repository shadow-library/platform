import { Module } from '@shadow-library/app';

import { OAuthModule } from '@server/modules/auth/oauth';
import { AuditModule } from '@server/modules/infrastructure/audit';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';
import { ApplicationModule } from '@server/modules/system/application';

import { OrgOAuthAppController } from './org-oauth-app.controller';
import { OrgOAuthAppService } from './org-oauth-app.service';

@Module({
  imports: [DatabaseModule, AuditModule, ApplicationModule, OAuthModule],
  controllers: [OrgOAuthAppController],
  providers: [OrgOAuthAppService],
  exports: [OrgOAuthAppService],
})
export class OrgOAuthAppModule {}
