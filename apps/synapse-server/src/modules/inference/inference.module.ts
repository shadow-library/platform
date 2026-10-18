import { Module } from '@shadow-library/app';

import { CatalogModule, SYSTEM_TIMERS } from '@modules/catalog';
import { CredentialsModule } from '@modules/credentials';
import { MeteringModule } from '@modules/metering';
import { ProvidersModule } from '@modules/providers';

import { InferenceService } from './inference.service';
import { INFERENCE_TIMERS, InflightRequests } from './inflight-requests.service';

/**
 * `InferenceController` is registered by the root `FastifyModule` (see `dynamic.modules.ts`) rather than here: importing `FastifyModule` for its
 * `ContextService` would put this module in the router's import cycle, and the init order's cycle breaking can then start it first and hang.
 */
@Module({
  imports: [CatalogModule, ProvidersModule, MeteringModule, CredentialsModule],
  providers: [{ token: INFERENCE_TIMERS, useValue: SYSTEM_TIMERS }, InflightRequests, InferenceService],
  exports: [INFERENCE_TIMERS, InflightRequests, InferenceService],
})
export class InferenceModule {}
