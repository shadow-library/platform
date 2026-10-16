import { Module } from '@shadow-library/app';
import { AuthModule } from '@shadow-library/auth/module';
import { FastifyModule } from '@shadow-library/fastify';
import { DatabaseModule } from '@shadow-library/modules';

import { CatalogModule } from '@modules/catalog';

import { AliasImpactService } from './alias-impact.service';
import { CallerService } from './caller.service';
import { CatalogAdminController } from './catalog-admin.controller';
import { CatalogController } from './catalog.controller';
import { CatalogViewService } from './catalog-view.service';
import { LedgerReportRepository } from './ledger-report.repository';
import { ProvidersController } from './providers.controller';
import { ProvidersViewService } from './providers-view.service';
import { UsageController } from './usage.controller';
import { UsageService } from './usage.service';

@Module({
  imports: [AuthModule, CatalogModule, DatabaseModule, FastifyModule],
  controllers: [CatalogController, CatalogAdminController, UsageController, ProvidersController],
  providers: [CallerService, CatalogViewService, LedgerReportRepository, AliasImpactService, UsageService, ProvidersViewService],
})
export class AdminModule {}
