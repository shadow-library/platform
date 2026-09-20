import { Config } from '@shadow-library/common';

declare module '@shadow-library/common' {
  export interface ConfigRecords {
    'server.port': number;
    'server.host': string;

    /** Credential for every chat and image model — they all route through OpenRouter. */
    'ai.openrouter.api.key': string | undefined;
    /** Points the OpenRouter leg at an in-cluster gateway speaking the same OpenAI-compatible protocol. */
    'ai.openrouter.api.url': string;

    /** Host of the local Ollama used for embeddings only; no chat call routes there. */
    'ai.ollama.host': string;
    'ai.embedding.model': string;

    'ai.llm.timeout-ms': number;
    'ai.llm.max-retries': number;
    'ai.llm.backoff-ms': number;

    /** Per-owner rolling window for the AI dispatch/spend guard, in milliseconds. */
    'ai.quota.window-ms': number;
    /** Max model dispatches one owner may make within the window; 0 disables the count limit. */
    'ai.quota.max-calls': number;
    /** Max accumulated model spend (USD, priced from the registry) one owner may reach within the window; 0 disables the spend limit. */
    'ai.quota.max-cost-usd': number;

    'ai.langsmith.api.key': string | undefined;

    /** Max projects one owner may hold; 0 disables the cap. */
    'projects.max-per-owner': number;

    'publishing.auto-push': boolean;

    /** Finalized chapters within an arc between automatic re-outlines of the arc's remaining chapters. */
    'generation.reconciliation.cadence': number;

    /** Directory whose direct children are plugin packages, each named for its plugin id. Empty or unset loads no plugins. */
    'plugins.dir': string;
  }
}

Config.load('server.port', { defaultValue: '8080', validateType: 'number' });
Config.load('server.host', { defaultValue: '0.0.0.0' });

Config.load('ai.openrouter.api.key');
Config.load('ai.openrouter.api.url', { defaultValue: 'https://openrouter.ai/api/v1' });
Config.load('ai.ollama.host', { defaultValue: 'http://localhost:11434' });
Config.load('ai.embedding.model', { defaultValue: 'qwen3-embedding:8b' });
Config.load('ai.llm.timeout-ms', { defaultValue: '300000', validateType: 'number' });
Config.load('ai.llm.max-retries', { defaultValue: '2', validateType: 'number' });
Config.load('ai.llm.backoff-ms', { defaultValue: '500', validateType: 'number' });
Config.load('ai.quota.window-ms', { defaultValue: '3600000', validateType: 'number' });
Config.load('ai.quota.max-calls', { defaultValue: '1000', validateType: 'number' });
Config.load('ai.quota.max-cost-usd', { defaultValue: '50', validateType: 'number' });
Config.load('ai.langsmith.api.key');

Config.load('projects.max-per-owner', { defaultValue: '100', validateType: 'number' });

Config.load('publishing.auto-push', { validateType: 'boolean', defaultValue: 'true' });

Config.load('generation.reconciliation.cadence', { defaultValue: '5', validateType: 'number' });

Config.load('plugins.dir', { defaultValue: '' });
