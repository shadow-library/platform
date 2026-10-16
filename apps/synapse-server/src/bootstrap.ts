import { Config } from '@shadow-library/common';

export type SeedProfile = 'standard' | 'local-only';

declare module '@shadow-library/common' {
  export interface ConfigRecords {
    'server.port': number;
    'server.host': string;

    'synapse.catalog.poll-ms': number;
    'synapse.request.timeout-ms': number;
    'synapse.server.keep-alive-timeout-ms': number;
    'synapse.server.max-requests-per-socket': number;
    'synapse.shutdown.grace-ms': number;
    'synapse.seed.profile': SeedProfile;

    'synapse.provider.subscription.url': string;
    'synapse.provider.openrouter.url': string;
    'synapse.provider.openrouter.api-key': string | undefined;
    'synapse.provider.local.url': string;

    'synapse.ledger.retention-days': number;
  }
}

const SEED_PROFILES: SeedProfile[] = ['standard', 'local-only'];

Config.load('server.port', { defaultValue: '8080', validateType: 'number' });
Config.load('server.host', { defaultValue: '0.0.0.0' });

Config.load('synapse.catalog.poll-ms', { defaultValue: '5000', validateType: 'integer' });
Config.load('synapse.request.timeout-ms', { defaultValue: '300000', validateType: 'integer' });
Config.load('synapse.server.keep-alive-timeout-ms', { defaultValue: '5000', validateType: 'integer' });
Config.load('synapse.server.max-requests-per-socket', { defaultValue: '50', validateType: 'integer' });
Config.load('synapse.shutdown.grace-ms', { defaultValue: '30000', validateType: 'integer' });
Config.load('synapse.seed.profile', { defaultValue: 'standard', allowedValues: SEED_PROFILES });

Config.load('synapse.provider.subscription.url', { defaultValue: 'http://host.docker.internal:7431/v1' });
Config.load('synapse.provider.openrouter.url', { defaultValue: 'https://openrouter.ai/api/v1' });
Config.load('synapse.provider.openrouter.api-key');
Config.load('synapse.provider.local.url', { defaultValue: 'http://host.docker.internal:11434' });

Config.load('synapse.ledger.retention-days', { defaultValue: '400', validateType: 'integer' });
