import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [DatabaseModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class MetricsModule {}
