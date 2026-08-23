import { Config } from '@shadow-library/common';
import { FastifyModule } from '@shadow-library/fastify';
import { HttpCoreModule } from '@shadow-library/modules';

export const AppHttpCoreModule = HttpCoreModule.forRoot({
  openapi: { normalizeSchemaIds: true },
});

export const HttpRouteModule = FastifyModule.forRoot({
  imports: [AppHttpCoreModule],

  host: Config.get('server.host'),
  port: Config.get('server.port'),
});
