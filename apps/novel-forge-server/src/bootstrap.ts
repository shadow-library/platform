import { Config } from '@shadow-library/common';

import { AI_BACKENDS, isSynapseBackend } from './modules/ai/ai-backend';
import { PRODUCTION_GROUP_DEFAULTS } from './modules/ai/defaults';
import { assertModelOverrideTarget } from './modules/ai/model-override';

declare module '@shadow-library/common' {
  export interface ConfigRecords {
    'server.port': number;
    'server.host': string;

    /** `synapse` sends every model call (chat, structured, streamed, tool-loop, image, embedding) to Synapse; `legacy` keeps the direct paths for one release. */
    'ai.backend': 'synapse' | 'legacy';

    /** Legacy backend only, never loaded on Synapse: the credential for every chat model and image generation. */
    'ai.openrouter.api.key': string | undefined;
    /** Legacy backend only: points the OpenRouter leg at an in-cluster gateway speaking the same OpenAI-compatible protocol. */
    'ai.openrouter.api.url': string | undefined;

    /** Legacy backend only: the local Ollama embeddings are made on; Synapse embeds through its pinned `novel-forge.embedding` task. */
    'ai.ollama.host': string | undefined;
    'ai.embedding.model': string | undefined;

    /**
     * Legacy backend only. Local-model test environments: every chat call is sent as this one model id, while routing, quota, telemetry and
     * cache keep the resolved id. Unset sends the resolved id.
     */
    'ai.model-override': string | undefined;
    /** Legacy backend only: `json-schema` also sends each structured call's schema as a constrained `response_format`; `prompt` keeps it in-band only. */
    'ai.structured-output': 'prompt' | 'json-schema';

    'ai.llm.timeout-ms': number;
    /** Transport retries of the legacy backend; Synapse fails over itself. */
    'ai.llm.max-retries': number;
    'ai.llm.backoff-ms': number;

    /** Per-owner rolling window for the legacy backend's dispatch/spend guard, in milliseconds; Synapse budgets apply otherwise, and `GET /ai/quota` reports it on both. */
    'ai.quota.window-ms': number;
    /** Max model dispatches one owner may make within the window; 0 disables the count limit. */
    'ai.quota.max-calls': number;
    /** Max accumulated model spend (USD, priced from the registry) one owner may reach within the window; 0 disables the spend limit. */
    'ai.quota.max-cost-usd': number;

    'ai.langsmith.api.key': string | undefined;
    'ai.web-search.brave.api.key': string | undefined;

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

Config.load('ai.backend', { allowedValues: [...AI_BACKENDS], defaultValue: 'synapse' });
Config.load('ai.model-override');
Config.load('ai.structured-output', { allowedValues: ['prompt', 'json-schema'], defaultValue: 'prompt' });
if (!isSynapseBackend()) {
  Config.load('ai.openrouter.api.key');
  Config.load('ai.openrouter.api.url', { defaultValue: 'https://openrouter.ai/api/v1' });
  Config.load('ai.ollama.host', { defaultValue: 'http://localhost:11434' });
  Config.load('ai.embedding.model', { defaultValue: PRODUCTION_GROUP_DEFAULTS.embedding.model });
  assertModelOverrideTarget(Config.get('ai.model-override'), Config.get('ai.openrouter.api.url'));
}
Config.load('ai.llm.timeout-ms', { defaultValue: '300000', validateType: 'number' });
Config.load('ai.llm.max-retries', { defaultValue: '2', validateType: 'number' });
Config.load('ai.llm.backoff-ms', { defaultValue: '500', validateType: 'number' });
Config.load('ai.quota.window-ms', { defaultValue: '3600000', validateType: 'number' });
Config.load('ai.quota.max-calls', { defaultValue: '1000', validateType: 'number' });
Config.load('ai.quota.max-cost-usd', { defaultValue: '50', validateType: 'number' });
Config.load('ai.langsmith.api.key');
Config.load('ai.web-search.brave.api.key');

Config.load('jobs.authoring-claim.ttl-ms', { defaultValue: '120000', validateType: 'number' });

Config.load('knowledge.reader-knows-label', { validateType: 'boolean', defaultValue: 'false' });

Config.load('imports.receive-deadline-ms', { defaultValue: '60000', validateType: 'number' });

Config.load('projects.max-per-owner', { defaultValue: '100', validateType: 'number' });

Config.load('publishing.auto-push', { validateType: 'boolean', defaultValue: 'true' });

Config.load('plugins.dir', { defaultValue: '' });
