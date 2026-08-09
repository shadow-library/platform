import { RequirePermission } from '@shadow-library/auth/module';
import { Get, HttpController, RespondFor } from '@shadow-library/fastify';

import { PULSE_PERMISSIONS } from '@modules/auth';

import { DashboardStats } from './dashboard-stats.dto';
import { DashboardService } from './dashboard.service';

@HttpController('/api/v1/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('/stats')
  @RequirePermission(PULSE_PERMISSIONS.metricsRead)
  @RespondFor(200, DashboardStats)
  getStats(): Promise<DashboardStats> {
    return this.dashboardService.getStats();
  }
}
