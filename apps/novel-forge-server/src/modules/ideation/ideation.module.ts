import { Module } from '@shadow-library/app';
import { FastifyModule } from '@shadow-library/fastify';
import { DatabaseModule } from '@shadow-library/modules';

import { ProjectModule } from '../project';
import { IdeationController, SeedController } from './ideation.controller';
import { IdeationService } from './ideation.service';

@Module({
  imports: [DatabaseModule, FastifyModule, ProjectModule],
  controllers: [SeedController, IdeationController],
  providers: [IdeationService],
  exports: [IdeationService],
})
export class IdeationModule {}
