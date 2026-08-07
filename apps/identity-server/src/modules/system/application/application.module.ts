import { Module } from '@shadow-library/app';

import { AuditModule } from '@modules/infrastructure/audit';
import { DatabaseModule } from '@modules/infrastructure/datastore';

import { ApplicationAccessService } from './application-access.service';
import { ApplicationMemberService } from './application-member.service';
import { ApplicationRoleService } from './application-role.service';
import { ApplicationService } from './application.service';
import { OrganisationApplicationService } from './organisation-application.service';

@Module({
  imports: [DatabaseModule, AuditModule],
  providers: [ApplicationService, ApplicationRoleService, ApplicationMemberService, ApplicationAccessService, OrganisationApplicationService],
  exports: [ApplicationService, ApplicationRoleService, ApplicationMemberService, ApplicationAccessService, OrganisationApplicationService],
})
export class ApplicationModule {}
