import 'reflect-metadata';

import { Module, ShadowFactory } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';

import './bootstrap';
import { manifestLogRedactionFormat } from './database/log-redaction';
import { SchedulerModule } from './modules/scheduler';

const redaction = manifestLogRedactionFormat();
if (Config.isProd()) Logger.attachTransport('console:json', redaction);
else if (Config.isDev()) Logger.attachTransport('console:pretty', redaction).attachTransport('file:json', redaction);

/** The ADR-0002 split seam: boots only the scheduler graph, no HTTP routes. Dormant until domain modules register sweeps on it. */
@Module({ imports: [SchedulerModule] })
class WorkerModule {}

ShadowFactory.create(WorkerModule).then(app => app.start());
