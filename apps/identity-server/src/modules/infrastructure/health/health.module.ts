import { Module } from '@shadow-library/app';

import { DatabaseModule } from '@server/modules/infrastructure/datastore';

import { HealthController } from './health.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
})
export class HealthModule {}
