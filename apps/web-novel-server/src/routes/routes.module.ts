import { Config } from '@shadow-library/common';
import { FastifyModule } from '@shadow-library/fastify';
import { HttpCoreModule } from '@shadow-library/modules';

import { WebNovelAuthModule } from '@server/modules/auth';
import { CatalogModule } from '@server/modules/catalog';
import { HealthModule } from '@server/modules/health';
import { PublishModule } from '@server/modules/publish';
import { ReaderModule } from '@server/modules/reader';
import { WikiModule } from '@server/modules/wiki';

export const AppHttpCoreModule = HttpCoreModule.forRoot({
  openapi: { normalizeSchemaIds: true },
});

export const HttpRouteModule = FastifyModule.forRoot({
  imports: [AppHttpCoreModule, WebNovelAuthModule, HealthModule, PublishModule, CatalogModule, ReaderModule, WikiModule],

  host: Config.get('server.host'),
  port: Config.get('server.port'),
});
