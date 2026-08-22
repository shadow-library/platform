import { Config } from '@shadow-library/common';

declare module '@shadow-library/common' {
  export interface ConfigRecords {
    'server.port': number;
    'server.host': string;

    'ai.profile': 'production' | 'local-test';
    'ai.anthropic.api.key': string | undefined;
    /** Overrides the Anthropic-compatible API endpoint; omit to use the SDK default. */
    'ai.anthropic.api.url': string | undefined;
    'ai.openai.api.key': string | undefined;
    /** Overrides the OpenAI-compatible API endpoint; omit to use the SDK default. */
    'ai.openai.api.url': string | undefined;
    'ai.xai.api.key': string | undefined;
    /** Overrides the xAI-compatible API endpoint; omit to use the SDK default. */
    'ai.xai.api.url': string | undefined;

    /** Direct vendor credential for image generation. Never reuse a gateway bearer token. */
    'ai.openai.image.api.key': string | undefined;
    /** Direct vendor credential for image generation. Never reuse a gateway bearer token. */
    'ai.xai.image.api.key': string | undefined;

    'ai.grok.llm.model': string;
    'ai.grok.image.model': string;
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
Config.load('ai.anthropic.api.key');
Config.load('ai.anthropic.api.url');
Config.load('ai.openai.api.key');
Config.load('ai.openai.api.url');
Config.load('ai.xai.api.key');
Config.load('ai.xai.api.url');
Config.load('ai.openai.image.api.key');
Config.load('ai.xai.image.api.key');
Config.load('ai.grok.llm.model', { defaultValue: 'grok-3' });
Config.load('ai.grok.image.model', { defaultValue: 'grok-2-image' });
Config.load('ai.ollama.host', { defaultValue: 'http://localhost:11434' });
Config.load('ai.embedding.model', { defaultValue: 'qwen3-embedding:8b' });
Config.load('ai.llm.timeout-ms', { defaultValue: '300000', validateType: 'number' });
Config.load('ai.llm.max-retries', { defaultValue: '2', validateType: 'number' });
Config.load('ai.llm.backoff-ms', { defaultValue: '500', validateType: 'number' });
Config.load('ai.langsmith.api.key');

Config.load('publishing.auto-push', { validateType: 'boolean', defaultValue: 'true' });

Config.load('generation.reconciliation.cadence', { defaultValue: '5', validateType: 'number' });
