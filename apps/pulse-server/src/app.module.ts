/**
 * Importing packages with side effects
 */
import './bootstrap';

/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';
import { FastifyModule } from '@shadow-library/fastify';
import { HttpCoreModule } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { ConfigurationModule } from '@modules/configuration';
import { MetricsModule } from '@modules/metrics';
import { NotificationModule } from '@modules/notification';
import { TemplateModule } from '@modules/template';

import { CUSTOM_DATA_TRANSFORMERS } from './common';
import { DatabaseModule } from './database';

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

const HttpRouteModule = FastifyModule.forRoot({
  imports: [AppHttpCoreModule, ConfigurationModule, NotificationModule, TemplateModule, MetricsModule],

  routePrefix: '/api',
  prefixVersioning: true,
  transformers: CUSTOM_DATA_TRANSFORMERS,
});

@Module({
  imports: [DatabaseModule, HttpRouteModule],
})
export class AppModule {}
