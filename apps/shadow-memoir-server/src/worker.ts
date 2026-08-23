import 'reflect-metadata';

import { Module, ShadowFactory } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';

import './bootstrap';
import { SchedulerModule } from './modules/scheduler';

if (Config.isProd()) Logger.attachTransport('console:json');
else if (Config.isDev()) Logger.attachTransport('console:pretty').attachTransport('file:json');

/** The ADR-0002 split seam: boots only the scheduler graph, no HTTP routes. Dormant until domain modules register sweeps on it. */
@Module({ imports: [SchedulerModule] })
class WorkerModule {}

ShadowFactory.create(WorkerModule).then(app => app.start());
