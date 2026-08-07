import { Module } from '@shadow-library/app';

import { DashboardController } from './dashboard.controller';

@Module({
  controllers: [DashboardController],
})
export class MetricsModule {}
