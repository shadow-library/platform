/**
 * Importing npm packages
 */
import { FastifyModule } from '@shadow-library/fastify';
import { HttpCoreModule } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { CUSTOM_DATA_TRANSFORMERS } from './common';
import { ConfigurationRoutesModule } from './configuration';
import { DashboardModule } from './dashboard';
import { NotificationRoutesModule } from './notification';
import { TemplateRoutesModule } from './template';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const AppHttpCoreModule = HttpCoreModule.forRoot({
  csrf: {
    disabled: true,
  },

  openapi: {
    normalizeSchemaIds: true,
  },
});

export const HttpRouteModule = FastifyModule.forRoot({
  imports: [AppHttpCoreModule, ConfigurationRoutesModule, DashboardModule, TemplateRoutesModule, NotificationRoutesModule],

  routePrefix: '/api',
  prefixVersioning: true,
  transformers: CUSTOM_DATA_TRANSFORMERS,
});
