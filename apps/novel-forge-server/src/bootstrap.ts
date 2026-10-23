import { Config } from '@shadow-library/common';

declare module '@shadow-library/common' {
  export interface ConfigRecords {
    'server.port': number;
    'server.host': string;

    'ai.llm.timeout-ms': number;

    /** The per-owner rolling window `GET /ai/quota` reports, in milliseconds; Synapse budgets are what refuse a call. */
    'ai.quota.window-ms': number;
    /** The call count `GET /ai/quota` reports as the window's limit; 0 reports none. */
    'ai.quota.max-calls': number;
    /** The spend (USD) `GET /ai/quota` reports as the window's limit; 0 reports none. */
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

Config.load('ai.llm.timeout-ms', { defaultValue: '300000', validateType: 'number' });
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
