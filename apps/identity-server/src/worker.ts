/**
 * Importing packages with side effects
 */
import 'reflect-metadata';

/**
 * Importing npm packages
 */
import { ShadowFactory } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { WorkerAppModule } from './worker.module';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
if (Config.isProd()) Logger.attachTransport('console:json');
else if (Config.isDev()) Logger.attachTransport('console:pretty').attachTransport('file:json');

ShadowFactory.create(WorkerAppModule).then(app => app.start());
