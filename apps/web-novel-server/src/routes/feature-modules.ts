import { CatalogModule } from '@server/modules/catalog';
import { HealthModule } from '@server/modules/health';
import { PublishModule } from '@server/modules/publish';
import { ReaderModule } from '@server/modules/reader';
import { WikiModule } from '@server/modules/wiki';

/** Kept apart from `routes.module.ts` so the route-policy spec can enumerate them without running `AuthModule.forRoot` */
export const FEATURE_MODULES = [HealthModule, PublishModule, CatalogModule, ReaderModule, WikiModule];
