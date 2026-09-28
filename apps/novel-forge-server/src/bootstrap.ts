import { Config } from '@shadow-library/common';

import { PRODUCTION_GROUP_DEFAULTS } from './modules/ai/defaults';
import { assertModelOverrideTarget } from './modules/ai/model-override';

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

    /** Local-model test environments only: every chat call is sent as this one model id, while routing, quota, telemetry and cache keep the resolved id. Unset sends the resolved id. */
    'ai.model-override': string | undefined;
    /** `json-schema` also sends each structured call's schema as a constrained `response_format`; `prompt` keeps it in-band only. */
    'ai.structured-output': 'prompt' | 'json-schema';

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

    /** How long an authoring claim survives without a heartbeat before another worker may take the project over. */
    'jobs.authoring-claim.ttl-ms': number;

    /** Proposed, off by default: sends the chapter writer the facts the reader knows and the POV cast does not, labelled as such. */
    'knowledge.reader-knows-label': boolean;

    /** How long a novel import's body may take to arrive before its admission permit is returned and the connection dropped. */
    'imports.receive-deadline-ms': number;

    /** Max projects one owner may hold; 0 disables the cap. */
    'projects.max-per-owner': number;

    'publishing.auto-push': boolean;

    /** Directory whose direct children are plugin packages, each named for its plugin id. Empty or unset loads no plugins. */
    'plugins.dir': string;
  }
}

Config.load('server.port', { defaultValue: '8080', validateType: 'number' });
Config.load('server.host', { defaultValue: '0.0.0.0' });

Config.load('ai.openrouter.api.key');
Config.load('ai.openrouter.api.url', { defaultValue: 'https://openrouter.ai/api/v1' });
Config.load('ai.ollama.host', { defaultValue: 'http://localhost:11434' });
Config.load('ai.embedding.model', { defaultValue: PRODUCTION_GROUP_DEFAULTS.embedding.model });
Config.load('ai.model-override');
Config.load('ai.structured-output', { allowedValues: ['prompt', 'json-schema'], defaultValue: 'prompt' });
assertModelOverrideTarget(Config.get('ai.model-override'), Config.get('ai.openrouter.api.url'));
Config.load('ai.llm.timeout-ms', { defaultValue: '300000', validateType: 'number' });
Config.load('ai.llm.max-retries', { defaultValue: '2', validateType: 'number' });
Config.load('ai.llm.backoff-ms', { defaultValue: '500', validateType: 'number' });
Config.load('ai.quota.window-ms', { defaultValue: '3600000', validateType: 'number' });
Config.load('ai.quota.max-calls', { defaultValue: '1000', validateType: 'number' });
Config.load('ai.quota.max-cost-usd', { defaultValue: '50', validateType: 'number' });
Config.load('ai.langsmith.api.key');

Config.load('jobs.authoring-claim.ttl-ms', { defaultValue: '120000', validateType: 'number' });

Config.load('knowledge.reader-knows-label', { validateType: 'boolean', defaultValue: 'false' });

Config.load('imports.receive-deadline-ms', { defaultValue: '60000', validateType: 'number' });

Config.load('projects.max-per-owner', { defaultValue: '100', validateType: 'number' });

Config.load('publishing.auto-push', { validateType: 'boolean', defaultValue: 'true' });

Config.load('plugins.dir', { defaultValue: '' });
