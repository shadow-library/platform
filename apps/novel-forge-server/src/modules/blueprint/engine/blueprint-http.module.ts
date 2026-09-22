import { Module } from '@shadow-library/app';

import { JobsModule } from '../../jobs/jobs.module';
import { BlueprintModule } from '../blueprint.module';
import { BlueprintRoundQueue } from './blueprint-round-queue.service';
import { BlueprintController } from './blueprint.controller';

/** HTTP wiring for Blueprint rounds, apart from BlueprintModule because JobsModule imports that module for the round runner. */
@Module({
  imports: [BlueprintModule, JobsModule],
  controllers: [BlueprintController],
  providers: [BlueprintRoundQueue],
})
export class BlueprintHttpModule {}
