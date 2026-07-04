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
    'ai.anthropicApiKey': string | undefined;
    'ai.openaiApiKey': string | undefined;
    'ai.xaiApiKey': string | undefined;
    'ai.grokLlmModel': string;
    'ai.grokImageModel': string;
    'ai.ollamaHost': string;
    'ai.allowClaudeCode': boolean;
    'ai.allowCodex': boolean;
    'ai.claudeCodeBin': string;
    'ai.codexBin': string;

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

Config.load('ai.anthropicApiKey');
Config.load('ai.openaiApiKey');
Config.load('ai.xaiApiKey');
Config.load('ai.grokLlmModel', { defaultValue: 'grok-3' });
Config.load('ai.grokImageModel', { defaultValue: 'grok-2-image' });
Config.load('ai.ollamaHost', { defaultValue: 'http://localhost:11434' });
Config.load('ai.allowClaudeCode', { defaultValue: 'false', validateType: 'boolean' });
Config.load('ai.allowCodex', { defaultValue: 'false', validateType: 'boolean' });
Config.load('ai.claudeCodeBin', { defaultValue: 'claude' });
Config.load('ai.codexBin', { defaultValue: 'codex' });

Config.load('storage.driver', { defaultValue: 'local', allowedValues: ['local'] });
Config.load('storage.imageDir', { defaultValue: './images' });
