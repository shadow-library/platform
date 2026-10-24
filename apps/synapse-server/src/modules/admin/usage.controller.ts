import { RequirePermission } from '@shadow-library/auth/module';
import { Get, HttpController, Query, RespondFor } from '@shadow-library/fastify';

import { SYNAPSE_PERMISSIONS } from '@modules/auth';

import { CallerService } from './caller.service';
import { UsageQuery, UsageResponse, UsageSeriesQuery, UsageSeriesResponse } from './usage.dto';
import { UsageService } from './usage.service';

@HttpController('/api/v1/admin/usage')
export class UsageController {
  constructor(
    private readonly caller: CallerService,
    private readonly usage: UsageService,
  ) {}

  @Get()
  @RequirePermission(SYNAPSE_PERMISSIONS.usageRead)
  @RespondFor(200, UsageResponse)
  getUsage(@Query() query: UsageQuery): Promise<UsageResponse> {
    this.caller.user();
    return this.usage.report(query);
  }

  @Get('/series')
  @RequirePermission(SYNAPSE_PERMISSIONS.usageRead)
  @RespondFor(200, UsageSeriesResponse)
  getUsageSeries(@Query() query: UsageSeriesQuery): Promise<UsageSeriesResponse> {
    this.caller.user();
    return this.usage.series(query);
  }
}
