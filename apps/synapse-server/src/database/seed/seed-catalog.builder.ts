import { type SeedProfile } from '@server/bootstrap';
import { PROVIDER_CREDENTIAL_KEYS } from '@server/constants';

import { type CatalogDocument } from '@modules/catalog/catalog.types';

import { SEED_CATALOG_DATA, UNRESTRICTED_LLM_ALLOWLIST } from './seed-catalog.data';

export interface SeedProviderUrls {
  subscription: string;
  openrouter: string;
  local: string;
}

export function buildSeedCatalog(profile: SeedProfile, urls: SeedProviderUrls): CatalogDocument {
  const document: CatalogDocument = {
    ...structuredClone(SEED_CATALOG_DATA),
    providers: {
      local: { kind: 'ollama', url: urls.local, locality: 'host', cost: 'zero' },
    },
  };

  for (const alias of Object.values(document.aliases)) {
    const unrestricted = document.models[alias.model]?.deployments.some(deployment => UNRESTRICTED_LLM_ALLOWLIST.includes(deployment.id));
    alias.available = { content_mode: unrestricted ? ['standard', 'unrestricted'] : ['standard'] };
  }

  if (profile === 'local-only') {
    document.providers.mock = { kind: 'mock', url: 'http://mock.synapse', locality: 'in_cluster', cost: 'zero' };
    for (const model of Object.values(document.models)) {
      if (model.capabilities.imageOutput) model.deployments = [{ provider: 'mock', id: 'mock-image' }];
      else model.deployments = [{ provider: 'local', id: model.capabilities.embedding ? 'qwen3-embedding:0.6b' : 'llama3.1' }];
    }
    return document;
  }

  document.providers.subscription = {
    kind: 'openai',
    flavor: 'subscription-gateway',
    url: urls.subscription,
    locality: 'host',
    cost: 'zero',
    features: ['sessions', 'native_web_search'],
    maxInflightPerReplica: 2,
  };
  document.providers.openrouter = {
    kind: 'openai',
    flavor: 'openrouter',
    url: urls.openrouter,
    apiKeyConfig: PROVIDER_CREDENTIAL_KEYS[0],
    locality: 'third_party',
    cost: 'metered',
  };
  return document;
}
