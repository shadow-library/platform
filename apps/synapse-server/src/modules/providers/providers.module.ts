import { Module } from '@shadow-library/app';

import { PROVIDER_FETCH, ProviderClient } from './provider-client.service';
import { WebSearchClient } from './web-search.client';

@Module({
  providers: [ProviderClient, WebSearchClient, { token: PROVIDER_FETCH, useValue: (url: string, init: RequestInit) => fetch(url, init) }],
  exports: [ProviderClient, WebSearchClient],
})
export class ProvidersModule {}
