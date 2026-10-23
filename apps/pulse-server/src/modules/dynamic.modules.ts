import { forwardRef, type Import, Module } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { FastifyModule } from '@shadow-library/fastify';
import { HttpCoreModule } from '@shadow-library/modules';

import { SessionModule } from '@modules/auth';
import { ConfigurationModule } from '@modules/configuration';
import { MetricsModule } from '@modules/metrics';
import { NotificationModule } from '@modules/notification';
import { TemplateModule } from '@modules/template';
import { CUSTOM_DATA_TRANSFORMERS } from '@server/common';

/** Controllers carry full paths instead of a global version prefix, which cannot express the unversioned `/api/auth/*` surface. */
const AppHttpCoreModule = HttpCoreModule.forRoot({
  openapi: {
    normalizeSchemaIds: true,
  },
});

/** Deferred so `AuthModule.forRoot` resolves its config at scan time, letting tests point the SDK at a per-file mock IdP before the module graph loads. */
const DeferredSessionModule = forwardRef(() => SessionModule.forRoot()) as unknown as Import;

/**
 * `HttpCoreModule` and the auth SDK each form an init cycle with `FastifyModule` through the factory-provided `FASTIFY_INSTANCE`, and whichever initialises first fails.
 * Bundling both under one `FastifyModule` child lets `FastifyModule`'s higher `requiredBy` initialise it first; it must stay a descendant so its controllers register.
 */
@Module({ imports: [AppHttpCoreModule, DeferredSessionModule] })
class PlatformModule {}

export const HttpRouteModule = FastifyModule.forRoot({
  host: Config.get('server.host'),
  port: Config.get('server.port'),

  imports: [PlatformModule, ConfigurationModule, NotificationModule, TemplateModule, MetricsModule],

  transformers: CUSTOM_DATA_TRANSFORMERS,
});
