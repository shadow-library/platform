import { Module } from '@shadow-library/app';

import { DatabaseModule } from '@server/modules/infrastructure/datastore';

import { LogSamplerService } from './log-sampler.service';

/** Separate from `SecurityModule` so the worker can sample its logs without that module's HTTP middlewares; keeping Fastify out of the worker also takes a deep import, since the barrel re-exports them */
@Module({
  imports: [DatabaseModule],
  providers: [LogSamplerService],
  exports: [LogSamplerService],
})
export class LogSamplerModule {}
