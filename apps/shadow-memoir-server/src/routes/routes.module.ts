import { Config } from '@shadow-library/common';
import { FastifyModule } from '@shadow-library/fastify';
import { HttpCoreModule } from '@shadow-library/modules';

import { AccountModule } from '@server/modules/account';
import { MemoirAuthModule } from '@server/modules/auth';
import { DevicesModule } from '@server/modules/devices';
import { SyncModule } from '@server/modules/sync';

export const AppHttpCoreModule = HttpCoreModule.forRoot({
  openapi: { normalizeSchemaIds: true },
});

export const HttpRouteModule = FastifyModule.forRoot({
  imports: [AppHttpCoreModule, MemoirAuthModule, SyncModule, DevicesModule, AccountModule],

  host: Config.get('server.host'),
  port: Config.get('server.port'),
});
