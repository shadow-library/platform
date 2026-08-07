import { Module } from '@shadow-library/app';

import { SessionModule } from '@server/modules/auth/session';
import { TokenModule } from '@server/modules/auth/token';
import { AuthzModule } from '@server/modules/authz';
import { AuditModule } from '@server/modules/infrastructure/audit';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';
import { NotificationModule } from '@server/modules/infrastructure/notification';
import { SecurityModule } from '@server/modules/infrastructure/security';
import { ApplicationModule } from '@server/modules/system/application';

import { DnsTxtResolver } from './dns-txt.resolver';
import { DomainController } from './domain.controller';
import { DomainService } from './domain.service';
import { InvitationService } from './invitation.service';
import { MeOrganisationController } from './me-organisation.controller';
import { OrganisationController } from './organisation.controller';
import { OrganisationService } from './organisation.service';

@Module({
  imports: [DatabaseModule, SessionModule, TokenModule, AuthzModule, AuditModule, NotificationModule, SecurityModule, ApplicationModule],
  controllers: [OrganisationController, MeOrganisationController, DomainController],
  providers: [OrganisationService, InvitationService, DomainService, DnsTxtResolver],
  exports: [OrganisationService, InvitationService, DomainService, DnsTxtResolver],
})
export class OrganisationModule {}
