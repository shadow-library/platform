import { Module } from '@shadow-library/app';
import { FastifyModule } from '@shadow-library/fastify';

import { JobsModule } from '../jobs/jobs.module';
import { PublishingController } from './publishing.controller';
import { PublishingModule } from './publishing.module';

/**
 * The publishing routes enqueue and dispatch publish jobs, and JobsModule imports PublishingModule for the
 * publish executor, so the controller is wired here rather than in PublishingModule to keep the graph acyclic.
 * `FastifyModule` supplies the `ContextService` the controller reads the session's active organisation from.
 */
@Module({
  imports: [JobsModule, PublishingModule, FastifyModule],
  controllers: [PublishingController],
})
export class PublishingHttpModule {}
