import { AuthModule } from '@shadow-library/auth/module';
import { Config } from '@shadow-library/common';
import { FastifyModule } from '@shadow-library/fastify';
import { HttpCoreModule } from '@shadow-library/modules';

import { FEATURE_MODULES } from './feature-modules';

const AppHttpCoreModule = HttpCoreModule.forRoot({
  openapi: { normalizeSchemaIds: true },
});

const AppAuthModule = AuthModule.forRoot({ routes: { basePath: '/api/auth' }, defaultAccessMode: 'private' });

export const HttpRouteModule = FastifyModule.forRoot({
  imports: [AppHttpCoreModule, AppAuthModule, ...FEATURE_MODULES],

  host: Config.get('server.host'),
  port: Config.get('server.port'),
});
