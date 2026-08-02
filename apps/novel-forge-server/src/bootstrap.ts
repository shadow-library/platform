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

    /** AI resilience configs — per-call timeout budget and transient-error backoff */
    'ai.llm.timeout-ms': number;
    'ai.llm.max-retries': number;
    'ai.llm.backoff-ms': number;

    /** Subprocess provider configs */
    'ai.claude-code.enabled': boolean;
    'ai.claude-code.bin': string;
    'ai.codex.enabled': boolean;
    'ai.codex.bin': string;
    'ai.grok-build.enabled': boolean;
    'ai.grok-build.bin': string;

    /** Observability configs */
    'ai.langsmith.api.key': string | undefined;

    /**
     * Storage configs (`storage.driver`, `storage.s3.*`, `storage.public-origin`, `storage.local.dir`) are
     * owned by `@shadow-library/modules`' `StorageModule`: it augments `ConfigRecords`, declares the
     * defaults, and resolves them lazily via `Config.register`. The app restates none of them here — the
     * deploy sets `STORAGE_*` env vars and `StorageModule.forRoot()` in `app.module` wires the service.
     */

    /** Publishing configs — whether a publish/unpublish immediately dispatches a reader push, or waits for the janitor sweep */
    'publishing.auto-push': boolean;

    /**
     * Auth configs (`auth.issuer`, `auth.app-id`, `auth.client.*`, `auth.session.*`, …) are owned by
     * `@shadow-library/auth/module`: it declares them, augments `ConfigRecords`, and reads them in
     * `AuthModule.forRoot()`. The app never restates them — audience, redirect URIs and granted scopes
     * are discovered from identity's `GET /api/v1/apps/me` (D-21). The reader-push client mints its
     * `web-novel:publish` tokens through an `AuthClient` built from the same registration; the reader's
     * base URL resolves via service discovery (`SERVICE_URL_WEB_NOVEL_SERVER`, or `http://web-novel-server`).
     */
  }
}

/**
 * Declaring the constants
 */

/** `app.stage` is declared and loaded by `@shadow-library/common`'s ConfigService for every app; nothing about it is restated here. */

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
Config.load('ai.llm.timeout-ms', { defaultValue: '300000', validateType: 'number' });
Config.load('ai.llm.max-retries', { defaultValue: '2', validateType: 'number' });
Config.load('ai.llm.backoff-ms', { defaultValue: '500', validateType: 'number' });
Config.load('ai.claude-code.enabled', { defaultValue: 'false', validateType: 'boolean' });
Config.load('ai.claude-code.bin', { defaultValue: 'claude' });
Config.load('ai.codex.enabled', { defaultValue: 'false', validateType: 'boolean' });
Config.load('ai.codex.bin', { defaultValue: 'codex' });
Config.load('ai.grok-build.enabled', { defaultValue: 'false', validateType: 'boolean' });
Config.load('ai.grok-build.bin', { defaultValue: 'grok' });
Config.load('ai.langsmith.api.key');

Config.load('publishing.auto-push', { validateType: 'boolean', defaultValue: 'true' });

// Every `auth.*` key is loaded by `@shadow-library/auth/module` (imported for its side effect when
// `AppAuthModule` pulls in `AuthModule.forRoot()`); the app deliberately declares none of them here.
