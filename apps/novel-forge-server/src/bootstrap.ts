/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Config } from '@shadow-library/common';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

declare module '@shadow-library/common' {
  export interface ConfigRecords {
    /** App configs */
    'app.stage': 'dev' | 'staging' | 'prod';

    /** Server configs */
    'server.port': number;
    'server.host': string;

    /** AI provider configs */
    'ai.profile': 'production' | 'local-test';
    'ai.anthropic.api.key': string | undefined;
    'ai.openai.api.key': string | undefined;
    'ai.xai.api.key': string | undefined;

    /** AI model configs */
    'ai.grok.llm.model': string;
    'ai.grok.image.model': string;
    'ai.ollama.host': string;
    'ai.embedding.model': string;

    /** Subprocess provider configs */
    'ai.claude-code.enabled': boolean;
    'ai.claude-code.bin': string;
    'ai.codex.enabled': boolean;
    'ai.codex.bin': string;
    'ai.grok-build.enabled': boolean;
    'ai.grok-build.bin': string;

    /** Observability configs */
    'ai.langsmith.api.key': string | undefined;

    /** Storage configs */
    'storage.driver': 'local';
    'storage.local.dir': string;
  }
}

/**
 * Declaring the constants
 */

Config.load('app.stage', { defaultValue: 'dev', allowedValues: ['dev', 'staging', 'prod'], isProdRequired: true });

Config.load('server.port', { defaultValue: '8080', validateType: 'number' });
Config.load('server.host', { defaultValue: '0.0.0.0' });

Config.load('ai.profile', { defaultValue: 'production', allowedValues: ['production', 'local-test'] });
Config.load('ai.anthropic.api.key');
Config.load('ai.openai.api.key');
Config.load('ai.xai.api.key');
Config.load('ai.grok.llm.model', { defaultValue: 'grok-3' });
Config.load('ai.grok.image.model', { defaultValue: 'grok-2-image' });
Config.load('ai.ollama.host', { defaultValue: 'http://localhost:11434' });
Config.load('ai.embedding.model', { defaultValue: 'qwen3-embedding:8b' });
Config.load('ai.claude-code.enabled', { defaultValue: 'false', validateType: 'boolean' });
Config.load('ai.claude-code.bin', { defaultValue: 'claude' });
Config.load('ai.codex.enabled', { defaultValue: 'false', validateType: 'boolean' });
Config.load('ai.codex.bin', { defaultValue: 'codex' });
Config.load('ai.grok-build.enabled', { defaultValue: 'false', validateType: 'boolean' });
Config.load('ai.grok-build.bin', { defaultValue: 'grok' });
Config.load('ai.langsmith.api.key');

Config.load('storage.driver', { defaultValue: 'local', allowedValues: ['local'] });
Config.load('storage.local.dir', { defaultValue: './images' });
