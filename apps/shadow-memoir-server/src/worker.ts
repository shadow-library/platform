import 'reflect-metadata';

import { Module, ShadowFactory } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';

import './bootstrap';
import { APP_NAME } from './constants';

if (Config.isProd()) Logger.attachTransport('console:json');
else if (Config.isDev()) Logger.attachTransport('console:pretty').attachTransport('file:json');

const logger = Logger.getLogger(APP_NAME, 'Worker');

/**
 * Dormant until the worker split (ADR-0002): the in-process scheduler currently runs inside `main.ts`
 * per the single-replica scale posture (§7). This entrypoint exists so the image already carries a
 * working `worker.ts` bundle — T-22 registers the scheduler's Postgres-claim modules here.
 */
@Module({})
class WorkerModule {}

ShadowFactory.create(WorkerModule).then(async app => {
  await app.start();
  logger.info('Worker booted with no scheduled work registered; exiting');
  await app.stop();
  process.exit(0);
});
