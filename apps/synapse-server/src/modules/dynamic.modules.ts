import { forwardRef, type Import, Module } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { FastifyModule } from '@shadow-library/fastify';
import { HttpCoreModule } from '@shadow-library/modules';

import { AdminModule } from '@modules/admin';
import { SessionModule } from '@modules/auth';
import { CatalogModule } from '@modules/catalog';
import { InferenceModule } from '@modules/inference';
import { MeteringModule } from '@modules/metering';
import { ProvidersModule } from '@modules/providers';

const AppHttpCoreModule = HttpCoreModule.forRoot({
  openapi: {
    normalizeSchemaIds: true,
  },
});

/** Deferred so `AuthModule.forRoot` resolves its config at scan time, after a test or the OpenAPI dump has pointed it at an offline IdP. */
const DeferredSessionModule = forwardRef(() => SessionModule.forRoot()) as unknown as Import;

/**
 * `HttpCoreModule` and the auth SDK each inject the factory-provided `FASTIFY_INSTANCE` and import `FastifyModule`, so each forms an init cycle with it.
 * Bundling both under one `FastifyModule` child collapses them into a single cycle that `FastifyModule` wins, so it initialises before either consumer.
 */
@Module({ imports: [AppHttpCoreModule, DeferredSessionModule] })
class PlatformModule {}

export const HttpRouteModule = FastifyModule.forRoot({
  host: Config.get('server.host'),
  port: Config.get('server.port'),

  imports: [PlatformModule, CatalogModule, ProvidersModule, InferenceModule, MeteringModule, AdminModule],
});
