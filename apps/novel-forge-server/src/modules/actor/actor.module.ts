import { Module } from '@shadow-library/app';
import { FastifyModule } from '@shadow-library/fastify';

import { ActorService } from './actor.service';

@Module({
  imports: [FastifyModule],
  providers: [ActorService],
  exports: [ActorService],
})
export class ActorModule {}
