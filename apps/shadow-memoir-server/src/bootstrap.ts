import { Config } from '@shadow-library/common';

declare module '@shadow-library/common' {
  export interface ConfigRecords {
    'server.port': number;
    'server.host': string;

    'account.context-ttl': number;

    'scheduler.enabled': boolean;
    'scheduler.tick-interval-ms': number;

    'rollover.catchup-max-days': number;

    'quotas.ocr-daily': number;
    'quotas.ai-free-monthly': number;
    'quotas.ai-paid-daily': number;
    'quotas.entry-daily-cap': number;
    'quotas.reschedule-cap': number;

    'ai.batch-window': string;
    'ai.model': string;
    'ai.prompt-version': string;
    'ai.task-timeout-minutes': number;

    'storage.receipts-bucket': string;

    'billing.provider': string;
    'billing.webhook-tolerance-seconds': number;

    'fx.provider-url': string;
    'fx.reconciliation-interval-minutes': number;
  }
}

Config.load('server.port', { defaultValue: '8080', validateType: 'number' });
Config.load('server.host', { defaultValue: '0.0.0.0' });

/** Seconds a resolved `sub -> account` mapping stays LRU-cached (à la `access.membership-ttl` on web-novel-server). */
Config.load('account.context-ttl', { defaultValue: '60', validateType: 'number', reloadable: true });

/** Per ADR-0002: the API replica turns this off once the worker Deployment (`src/worker.ts`) takes over the scheduler. */
Config.load('scheduler.enabled', { defaultValue: 'true', validateType: 'boolean', reloadable: true });
Config.load('scheduler.tick-interval-ms', { defaultValue: '5000', validateType: 'number' });

/** Bounds the per-account day-close walk (§13.3); days beyond it aren't terminalized, only cost-capped. Tunable, not a correctness parameter. */
Config.load('rollover.catchup-max-days', { defaultValue: '90', validateType: 'number', reloadable: true });

Config.load('quotas.ocr-daily', { defaultValue: '5', validateType: 'number', reloadable: true });
Config.load('quotas.ai-free-monthly', { defaultValue: '2', validateType: 'number', reloadable: true });
Config.load('quotas.ai-paid-daily', { defaultValue: '30', validateType: 'number', reloadable: true });
Config.load('quotas.entry-daily-cap', { defaultValue: '200', validateType: 'number', reloadable: true });
Config.load('quotas.reschedule-cap', { defaultValue: '3', validateType: 'number', reloadable: true });

/** Local time-of-day (account tz, HH:mm) the nightly AI batch executor opens its claim loop. */
Config.load('ai.batch-window', { defaultValue: '02:00', reloadable: true });
Config.load('ai.model', { defaultValue: 'llama3.1' });
Config.load('ai.prompt-version', { defaultValue: 'v1' });
Config.load('ai.task-timeout-minutes', { defaultValue: '30', validateType: 'number', reloadable: true });

/** Garage bucket for receipt blobs (§19); provisioned per env by the T-04 operator checklist. */
Config.load('storage.receipts-bucket', { defaultValue: 'memoir-receipts' });

Config.load('billing.provider', { defaultValue: 'stripe' });
Config.load('billing.webhook-tolerance-seconds', { defaultValue: '300', validateType: 'number' });

Config.load('fx.provider-url', { defaultValue: 'https://api.exchangerate.host' });
Config.load('fx.reconciliation-interval-minutes', { defaultValue: '60', validateType: 'number' });
