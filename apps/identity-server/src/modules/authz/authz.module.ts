/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { KeyModule } from '@server/modules/auth/keys';
import { AuditModule } from '@server/modules/infrastructure/audit';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';
import { ApplicationModule } from '@server/modules/system/application';

import { AuthzController } from './authz.controller';
import { CatalogSyncService } from './catalog-sync.service';
import { PolicyDecisionService } from './policy-decision.service';
import { ServiceTokenGuard } from './service-token.guard';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule, KeyModule, AuditModule, ApplicationModule],
  controllers: [AuthzController, ServiceTokenGuard],
  providers: [PolicyDecisionService, CatalogSyncService],
  exports: [PolicyDecisionService],
})
export class AuthzModule {}
