import { Module } from '@shadow-library/app';
import { AuthModule } from '@shadow-library/auth/module';
import { FastifyModule } from '@shadow-library/fastify';
import { DatabaseModule } from '@shadow-library/modules';

import { CatalogModule } from '@modules/catalog';
import { CredentialsModule } from '@modules/credentials';

import { AccessController } from './access.controller';
import { AliasImpactService } from './alias-impact.service';
import { CallerService } from './caller.service';
import { CatalogAdminController } from './catalog-admin.controller';
import { CatalogController } from './catalog.controller';
import { CatalogViewService } from './catalog-view.service';
import { CredentialsController } from './credentials.controller';
import { LedgerReportRepository } from './ledger-report.repository';
import { ProvidersController } from './providers.controller';
import { ProvidersViewService } from './providers-view.service';
import { UsageController } from './usage.controller';
import { UsageService } from './usage.service';

@Module({
  imports: [AuthModule, CatalogModule, CredentialsModule, DatabaseModule, FastifyModule],
  controllers: [AccessController, CatalogController, CatalogAdminController, UsageController, ProvidersController, CredentialsController],
  providers: [CallerService, CatalogViewService, LedgerReportRepository, AliasImpactService, UsageService, ProvidersViewService],
})
export class AdminModule {}
