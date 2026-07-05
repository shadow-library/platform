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

    /** AI configs */
    'ai.profile': 'production' | 'local-test';
    'ai.anthropicApiKey': string | undefined;
    'ai.openaiApiKey': string | undefined;
    'ai.xaiApiKey': string | undefined;
    'ai.grokLlmModel': string;
    'ai.grokImageModel': string;
    'ai.ollamaHost': string;
    'ai.embeddingModel': string;
    'ai.allowClaudeCode': boolean;
    'ai.allowCodex': boolean;
    'ai.claudeCodeBin': string;
    'ai.codexBin': string;

    /** Observability configs */
    'ai.langsmithApiKey': string | undefined;

    /** Storage configs */
    'storage.driver': 'local';
    'storage.imageDir': string;
  }
}

/**
 * Declaring the constants
 */

Config.load('app.stage', { defaultValue: 'dev', allowedValues: ['dev', 'staging', 'prod'], isProdRequired: true });

Config.load('server.port', { defaultValue: '8080', validateType: 'number' });
Config.load('server.host', { defaultValue: '0.0.0.0' });

Config.load('ai.profile', { defaultValue: 'production', allowedValues: ['production', 'local-test'] });
Config.load('ai.anthropicApiKey', { envKey: 'AI_ANTHROPIC_API_KEY' });
Config.load('ai.openaiApiKey', { envKey: 'AI_OPENAI_API_KEY' });
Config.load('ai.xaiApiKey', { envKey: 'AI_XAI_API_KEY' });
Config.load('ai.grokLlmModel', { envKey: 'AI_GROK_LLM_MODEL', defaultValue: 'grok-3' });
Config.load('ai.grokImageModel', { envKey: 'AI_GROK_IMAGE_MODEL', defaultValue: 'grok-2-image' });
Config.load('ai.ollamaHost', { envKey: 'AI_OLLAMA_HOST', defaultValue: 'http://localhost:11434' });
Config.load('ai.embeddingModel', { envKey: 'AI_EMBEDDING_MODEL', defaultValue: 'qwen3-embedding:8b' });
Config.load('ai.allowClaudeCode', { envKey: 'AI_ALLOW_CLAUDE_CODE', defaultValue: 'false', validateType: 'boolean' });
Config.load('ai.allowCodex', { envKey: 'AI_ALLOW_CODEX', defaultValue: 'false', validateType: 'boolean' });
Config.load('ai.claudeCodeBin', { envKey: 'AI_CLAUDE_CODE_BIN', defaultValue: 'claude' });
Config.load('ai.codexBin', { envKey: 'AI_CODEX_BIN', defaultValue: 'codex' });

Config.load('ai.langsmithApiKey', { envKey: 'AI_LANGSMITH_API_KEY' });

Config.load('storage.driver', { defaultValue: 'local', allowedValues: ['local'] });
Config.load('storage.imageDir', { envKey: 'STORAGE_IMAGE_DIR', defaultValue: './images' });
