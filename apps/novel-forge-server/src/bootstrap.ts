import { Config } from '@shadow-library/common';

declare module '@shadow-library/common' {
  export interface ConfigRecords {
    'server.port': number;
    'server.host': string;

    'ai.profile': 'production' | 'local-test';
    /** Credential for every hosted chat model — they all route through OpenRouter. */
    'ai.openrouter.api.key': string | undefined;
    /** Points the OpenRouter leg at an in-cluster gateway speaking the same OpenAI-compatible protocol. */
    'ai.openrouter.api.url': string;

    'ai.ollama.host': string;
    'ai.embedding.model': string;

    'ai.llm.timeout-ms': number;
    'ai.llm.max-retries': number;
    'ai.llm.backoff-ms': number;

    'ai.langsmith.api.key': string | undefined;

    'publishing.auto-push': boolean;

    /** Finalized chapters within an arc between automatic re-outlines of the arc's remaining chapters. */
    'generation.reconciliation.cadence': number;
  }
}

Config.load('server.port', { defaultValue: '8080', validateType: 'number' });
Config.load('server.host', { defaultValue: '0.0.0.0' });

Config.load('ai.profile', { defaultValue: 'production', allowedValues: ['production', 'local-test'] });
Config.load('ai.openrouter.api.key');
Config.load('ai.openrouter.api.url', { defaultValue: 'https://openrouter.ai/api/v1' });
Config.load('ai.ollama.host', { defaultValue: 'http://localhost:11434' });
Config.load('ai.embedding.model', { defaultValue: 'qwen3-embedding:8b' });
Config.load('ai.llm.timeout-ms', { defaultValue: '300000', validateType: 'number' });
Config.load('ai.llm.max-retries', { defaultValue: '2', validateType: 'number' });
Config.load('ai.llm.backoff-ms', { defaultValue: '500', validateType: 'number' });
Config.load('ai.langsmith.api.key');

Config.load('publishing.auto-push', { validateType: 'boolean', defaultValue: 'true' });

Config.load('generation.reconciliation.cadence', { defaultValue: '5', validateType: 'number' });
