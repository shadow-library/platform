/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { SessionModule } from '@server/modules/auth/session';
import { AuthzModule } from '@server/modules/authz';
import { AuditModule } from '@server/modules/infrastructure/audit';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';
import { NotificationModule } from '@server/modules/infrastructure/notification';
import { SecurityModule } from '@server/modules/infrastructure/security';

import { InvitationService } from './invitation.service';
import { MeOrganisationController } from './me-organisation.controller';
import { OrganisationController } from './organisation.controller';
import { OrganisationService } from './organisation.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, SessionModule, AuthzModule, AuditModule, NotificationModule, SecurityModule],
  controllers: [OrganisationController, MeOrganisationController],
  providers: [OrganisationService, InvitationService],
  exports: [OrganisationService, InvitationService],
})
export class OrganisationModule {}
