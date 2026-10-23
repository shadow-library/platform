import { Module } from '@shadow-library/app';
import { FastifyModule } from '@shadow-library/fastify';

import { JobsModule } from '../jobs/jobs.module';
import { PublishingController } from './publishing.controller';
import { PublishingModule } from './publishing.module';

/** Wired apart from PublishingModule because JobsModule imports PublishingModule for the publish executor; keeps the module graph acyclic. */
@Module({
  imports: [JobsModule, PublishingModule, FastifyModule],
  controllers: [PublishingController],
})
export class PublishingHttpModule {}
