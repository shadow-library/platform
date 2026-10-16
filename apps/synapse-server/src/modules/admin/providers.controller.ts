import { RequirePermission } from '@shadow-library/auth/module';
import { Get, HttpController, RespondFor } from '@shadow-library/fastify';

import { SYNAPSE_PERMISSIONS } from '@modules/auth';

import { CallerService } from './caller.service';
import { ProvidersResponse } from './providers.dto';
import { ProvidersViewService } from './providers-view.service';

@HttpController('/api/v1/admin/providers')
export class ProvidersController {
  constructor(
    private readonly caller: CallerService,
    private readonly providers: ProvidersViewService,
  ) {}

  @Get()
  @RequirePermission(SYNAPSE_PERMISSIONS.catalogRead)
  @RespondFor(200, ProvidersResponse)
  getProviders(): Promise<ProvidersResponse> {
    this.caller.user();
    return this.providers.report();
  }
}
