/**
 * Importing npm packages
 */
import { FastifyModule } from '@shadow-library/fastify';
import { HttpCoreModule } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { AuthModule } from '@modules/auth';
import { ConfigurationModule } from '@modules/configuration';
import { MetricsModule } from '@modules/metrics';
import { NotificationModule } from '@modules/notification';
import { TemplateModule } from '@modules/template';
import { CUSTOM_DATA_TRANSFORMERS } from '@server/common';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
export const AppHttpCoreModule = HttpCoreModule.forRoot({
  csrf: {
    disabled: true,
  },

  openapi: {
    normalizeSchemaIds: true,
  },
});

export const HttpRouteModule = FastifyModule.forRoot({
  imports: [AppHttpCoreModule, AuthModule.forRoot(), ConfigurationModule, NotificationModule, TemplateModule, MetricsModule],

  routePrefix: '/api',
  prefixVersioning: true,
  transformers: CUSTOM_DATA_TRANSFORMERS,
});
