import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { ActiveCatalogCache, CATALOG_TIMERS, SYSTEM_TIMERS } from './active-catalog.cache';
import { CatalogVersionRepository } from './catalog-version.repository';
import { CatalogVersionService } from './catalog-version.service';

@Module({
  imports: [DatabaseModule],
  providers: [{ token: CATALOG_TIMERS, useValue: SYSTEM_TIMERS }, CatalogVersionRepository, ActiveCatalogCache, CatalogVersionService],
  exports: [ActiveCatalogCache, CatalogVersionService],
})
export class CatalogModule {}
