import 'reflect-metadata';

import { ShadowFactory } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';

import { WorkerAppModule } from './worker.module';

if (Config.isProd()) Logger.attachTransport('console:json');
else if (Config.isDev()) Logger.attachTransport('console:pretty').attachTransport('file:json');

ShadowFactory.create(WorkerAppModule).then(app => app.start());
