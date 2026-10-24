import { RequirePermission } from '@shadow-library/auth/module';
import { Get, HttpController, RespondFor } from '@shadow-library/fastify';

import { SYNAPSE_PERMISSIONS } from '@modules/auth';

import { BudgetStatusService } from './budget-status.service';
import { BudgetStatusResponse } from './budgets.dto';
import { CallerService } from './caller.service';

@HttpController('/api/v1/admin/budgets')
export class BudgetsController {
  constructor(
    private readonly caller: CallerService,
    private readonly budgets: BudgetStatusService,
  ) {}

  @Get('/status')
  @RequirePermission(SYNAPSE_PERMISSIONS.usageRead)
  @RespondFor(200, BudgetStatusResponse)
  getStatus(): Promise<BudgetStatusResponse> {
    this.caller.user();
    return this.budgets.status();
  }
}
