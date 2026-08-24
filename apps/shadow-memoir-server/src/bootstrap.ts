import { Config } from '@shadow-library/common';

declare module '@shadow-library/common' {
  export interface ConfigRecords {
    'server.port': number;
    'server.host': string;

    'account.context-ttl': number;

    'sync.epoch': string;
    'sync.page-size': number;
    'sync.cursor-overlap': number;

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
    'storage.max-receipt-bytes': number;
    'storage.orphan-sweep.pending-upload-max-age-minutes': number;
    'storage.orphan-sweep.pending-upload-interval-minutes': number;
    'storage.orphan-sweep.object-interval-minutes': number;

    'billing.provider': string;
    'billing.webhook-tolerance-seconds': number;
    'billing.webhook-secret': string;
    'billing.checkout-url': string;
    'billing.trial-days': number;
    'billing.grace-days': number;
    'billing.price-monthly-minor': number;
    'billing.price-yearly-minor': number;
    'billing.currency': string;
    'billing.lapse-sweep-interval-minutes': number;

    'fx.provider-url': string;
    'fx.reconciliation-interval-minutes': number;

    'reconciliation.sweep-interval-minutes': number;
    'reconciliation.streak-sample-size': number;
    'reconciliation.wedged-last-hp-lag-days': number;
    'reconciliation.command-log-retention-days': number;
    'reconciliation.command-log-prune-batch-size': number;
    'reconciliation.command-log-prune-max-batches': number;

    'telemetry.pseudo-id-secret': string;
  }
}

Config.load('server.port', { defaultValue: '8080', validateType: 'number' });
Config.load('server.host', { defaultValue: '0.0.0.0' });

/** Seconds a resolved `sub -> account` mapping stays LRU-cached (à la `access.membership-ttl` on web-novel-server). */
Config.load('account.context-ttl', { defaultValue: '60', validateType: 'number', reloadable: true });

/** Bumping this invalidates every client cursor: the next delta pull sees a new epoch and full-resyncs from `since=0` (ARCHITECTURE §12.4). */
Config.load('sync.epoch', { defaultValue: '1', reloadable: true });
Config.load('sync.page-size', { defaultValue: '500', validateType: 'number', reloadable: true });

/**
 * How far behind the highest observed `sync_seq` a returned cursor lags, so a row whose sequence value
 * was drawn before a concurrent transaction's but committed after it is still re-served (§12.2). Only
 * applied once the pull has drained — mid-backlog the cursor is exact, or a page smaller than the
 * overlap could never advance it.
 */
Config.load('sync.cursor-overlap', { defaultValue: '100', validateType: 'number', reloadable: true });

/** Per ADR-0002: the API replica turns this off once the worker Deployment (`src/worker.ts`) takes over the scheduler. */
Config.load('scheduler.enabled', { defaultValue: 'true', validateType: 'boolean', reloadable: true });
Config.load('scheduler.tick-interval-ms', { defaultValue: '5000', validateType: 'number' });

/** Bounds the per-account day-close walk (§13.3); days beyond it aren't terminalized, only cost-capped. Tunable, not a correctness parameter. */
Config.load('rollover.catchup-max-days', { defaultValue: '90', validateType: 'number', reloadable: true });

/** PRD §4.14/§2.5: 10 scans/user/day, tunable. */
Config.load('quotas.ocr-daily', { defaultValue: '10', validateType: 'number', reloadable: true });
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

/** Application-level ceiling for an uploaded receipt (§19.2); the `receipts.size_bytes` CHECK (8 MB) is the hard backstop this can only tighten. */
Config.load('storage.max-receipt-bytes', { defaultValue: '8388608', validateType: 'number', reloadable: true });

/** §19.2 orphan sweep (a): a `pending_upload` row older than this never got confirmed — the object (if any) and the row are deleted. */
Config.load('storage.orphan-sweep.pending-upload-max-age-minutes', { defaultValue: '1440', validateType: 'number', reloadable: true });
Config.load('storage.orphan-sweep.pending-upload-interval-minutes', { defaultValue: '60', validateType: 'number', reloadable: true });

/** §19.2 orphan sweep (b): weekly belt sweep — objects under an account's prefix with no `receipts` row are deleted. */
Config.load('storage.orphan-sweep.object-interval-minutes', { defaultValue: '10080', validateType: 'number', reloadable: true });

/** Owner decision A-6 (the concrete PSP) is unresolved: the shipped adapter is `GenericHmacBillingAdapter`, so this names it until a provider is chosen. */
Config.load('billing.provider', { defaultValue: 'generic-hmac' });
Config.load('billing.webhook-tolerance-seconds', { defaultValue: '300', validateType: 'number' });

/** Shared secret the provider signs webhook bodies with; ops-provisioned per env (SOPS). Empty means the webhook route refuses every delivery rather than accepting an unverifiable one. */
Config.load('billing.webhook-secret', { defaultValue: '' });
Config.load('billing.checkout-url', { defaultValue: '' });

/** PRD §6.9: $10/month, $100/year, 7-day trial — all tunable without redeploy. The grace window the PRD leaves open is set here too. */
Config.load('billing.trial-days', { defaultValue: '7', validateType: 'number', reloadable: true });
Config.load('billing.grace-days', { defaultValue: '7', validateType: 'number', reloadable: true });
Config.load('billing.price-monthly-minor', { defaultValue: '1000', validateType: 'number', reloadable: true });
Config.load('billing.price-yearly-minor', { defaultValue: '10000', validateType: 'number', reloadable: true });
Config.load('billing.currency', { defaultValue: 'USD', reloadable: true });
Config.load('billing.lapse-sweep-interval-minutes', { defaultValue: '60', validateType: 'number', reloadable: true });

Config.load('fx.provider-url', { defaultValue: 'https://api.exchangerate.host' });
Config.load('fx.reconciliation-interval-minutes', { defaultValue: '60', validateType: 'number' });

/** ARCHITECTURE §11.4/§26: the account-mirror drift check, wedged-rollover surface, and quest-streak rebuild-compare all ride this cadence. */
Config.load('reconciliation.sweep-interval-minutes', { defaultValue: '10080', validateType: 'number', reloadable: true });
Config.load('reconciliation.streak-sample-size', { defaultValue: '25', validateType: 'number', reloadable: true });
/** How far a `last_hp_date` may lag behind a later `command_log` entry before the account is surfaced as a wedged-rollover candidate. */
Config.load('reconciliation.wedged-last-hp-lag-days', { defaultValue: '3', validateType: 'number', reloadable: true });
Config.load('reconciliation.command-log-retention-days', { defaultValue: '90', validateType: 'number', reloadable: true });
Config.load('reconciliation.command-log-prune-batch-size', { defaultValue: '1000', validateType: 'number', reloadable: true });
Config.load('reconciliation.command-log-prune-max-batches', { defaultValue: '20', validateType: 'number', reloadable: true });

/** HMAC key for the analytics pseudo-id (§23) — an account id must never be recoverable from it. Ops-provisioned per env; the default is dev/test-only. */
Config.load('telemetry.pseudo-id-secret', { defaultValue: 'dev-only-telemetry-pseudo-id-secret' });
