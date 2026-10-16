import { Module } from '@shadow-library/app';

import { PROVIDER_FETCH, ProviderClient } from './provider-client.service';

@Module({
  providers: [ProviderClient, { token: PROVIDER_FETCH, useValue: (url: string, init: RequestInit) => fetch(url, init) }],
  exports: [ProviderClient],
})
export class ProvidersModule {}
