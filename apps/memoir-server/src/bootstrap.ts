import { Config } from '@shadow-library/common';

import { DEV_PSEUDO_ID_SECRET } from './constants';

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
    'ai.batch-window-start': string;
    'ai.batch-window-end': string;
    'ai.batch-poll-interval-minutes': number;
    'ai.retry-poll-interval-minutes': number;
    'ai.stuck-sweep-interval-minutes': number;
    'ai.held-resume-interval-minutes': number;
    'ai.max-attempts': number;
    'ai.claim-batch-size': number;
    'ai.free-history-months': number;
    'ai.inference-timeout-ms': number;
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

    'deletion.sweep-interval-minutes': number;
    'deletion.resume-after-minutes': number;
    'deletion.purge-batch-size': number;
    'deletion.purge-max-batches': number;

    'identity.close-service': string;
    'identity.close-path': string;
    'identity.close-scope': string;

    'telemetry.pseudo-id-secret': string;

    'export.max-per-day': number;
    'export.page-size': number;
    'export.claim-batch-size': number;
    'export.assembler-interval-minutes': number;
    'export.retention-days': number;
    'export.cleanup-interval-minutes': number;
    'export.download-presign-seconds': number;

    'notifications.sender-poll-interval-minutes': number;
    'notifications.sender-batch-size': number;
    'notifications.sender-max-attempts': number;
    'notifications.billing-sweep-interval-minutes': number;
    'notifications.billing-reminder-lead-days': number;
    'notifications.digest-sweep-interval-minutes': number;
  }
}

Config.load('server.port', { defaultValue: '8080', validateType: 'number' });
Config.load('server.host', { defaultValue: '0.0.0.0' });

/** Seconds a resolved `sub -> account` mapping stays LRU-cached. */
Config.load('account.context-ttl', { defaultValue: '60', validateType: 'number', reloadable: true });

/** Bumping this invalidates every client cursor: the next delta pull sees a new epoch and full-resyncs from `since=0`. */
Config.load('sync.epoch', { defaultValue: '1', reloadable: true });
Config.load('sync.page-size', { defaultValue: '500', validateType: 'number', reloadable: true });

/**
 * Holds a returned cursor this far behind the highest observed `sync_seq`, so a row whose sequence was drawn before a concurrent transaction's but committed after it is re-served.
 * Applied only once the pull has drained; mid-backlog a page smaller than the overlap could never advance the cursor.
 */
Config.load('sync.cursor-overlap', { defaultValue: '100', validateType: 'number', reloadable: true });

Config.load('scheduler.enabled', { defaultValue: 'true', validateType: 'boolean', reloadable: true });
Config.load('scheduler.tick-interval-ms', { defaultValue: '5000', validateType: 'number' });

/** Days older than this are never terminalized; the walk skips to the bound. */
Config.load('rollover.catchup-max-days', { defaultValue: '90', validateType: 'number', reloadable: true });

Config.load('quotas.ocr-daily', { defaultValue: '10', validateType: 'number', reloadable: true });
Config.load('quotas.ai-free-monthly', { defaultValue: '2', validateType: 'number', reloadable: true });
Config.load('quotas.ai-paid-daily', { defaultValue: '30', validateType: 'number', reloadable: true });
Config.load('quotas.entry-daily-cap', { defaultValue: '200', validateType: 'number', reloadable: true });
Config.load('quotas.reschedule-cap', { defaultValue: '3', validateType: 'number', reloadable: true });

/** Local time-of-day (account timezone, HH:mm) the submission path quotes back as "ready tonight". */
Config.load('ai.batch-window', { defaultValue: '02:00', reloadable: true });

/** The executor's own window is account-agnostic server time: one batch drain serves every account, so it cannot use a per-account timezone like `ai.batch-window`. */
Config.load('ai.batch-window-start', { defaultValue: '02:00', reloadable: true });
Config.load('ai.batch-window-end', { defaultValue: '06:00', reloadable: true });
Config.load('ai.batch-poll-interval-minutes', { defaultValue: '5', validateType: 'number', reloadable: true });

/**
 * Off-window poll that picks up only tasks a previous attempt requeued, so a transient inference failure retries within the day
 * rather than waiting for the next night.
 */
Config.load('ai.retry-poll-interval-minutes', { defaultValue: '15', validateType: 'number', reloadable: true });
Config.load('ai.stuck-sweep-interval-minutes', { defaultValue: '10', validateType: 'number', reloadable: true });
Config.load('ai.held-resume-interval-minutes', { defaultValue: '60', validateType: 'number', reloadable: true });

/** A task claimed this many times without finishing is terminal: `failed`, quota refunded. */
Config.load('ai.max-attempts', { defaultValue: '3', validateType: 'number', reloadable: true });
Config.load('ai.claim-batch-size', { defaultValue: '50', validateType: 'number', reloadable: true });

Config.load('ai.free-history-months', { defaultValue: '3', validateType: 'number', reloadable: true });

Config.load('ai.inference-timeout-ms', { defaultValue: '120000', validateType: 'number', reloadable: true });
Config.load('ai.prompt-version', { defaultValue: 'v1' });
Config.load('ai.task-timeout-minutes', { defaultValue: '30', validateType: 'number', reloadable: true });

Config.load('storage.receipts-bucket', { defaultValue: 'memoir-receipts' });

/** Application-level ceiling; the `receipts.size_bytes` CHECK (8 MB) is the hard backstop this can only tighten. */
Config.load('storage.max-receipt-bytes', { defaultValue: '8388608', validateType: 'number', reloadable: true });

/** A `pending_upload` row older than this never got confirmed: the object (if any) and the row are deleted. */
Config.load('storage.orphan-sweep.pending-upload-max-age-minutes', { defaultValue: '1440', validateType: 'number', reloadable: true });
Config.load('storage.orphan-sweep.pending-upload-interval-minutes', { defaultValue: '60', validateType: 'number', reloadable: true });

/** Weekly sweep deleting objects under an account's prefix that have no `receipts` row. */
Config.load('storage.orphan-sweep.object-interval-minutes', { defaultValue: '10080', validateType: 'number', reloadable: true });

/** Names `GenericHmacBillingAdapter`, the only shipped adapter, until a payment provider is chosen. */
Config.load('billing.provider', { defaultValue: 'generic-hmac' });
Config.load('billing.webhook-tolerance-seconds', { defaultValue: '300', validateType: 'number' });

/** Empty means the webhook route refuses every delivery rather than accept an unverifiable one. */
Config.load('billing.webhook-secret', { defaultValue: '' });
Config.load('billing.checkout-url', { defaultValue: '' });

Config.load('billing.trial-days', { defaultValue: '7', validateType: 'number', reloadable: true });
Config.load('billing.grace-days', { defaultValue: '7', validateType: 'number', reloadable: true });
Config.load('billing.price-monthly-minor', { defaultValue: '1000', validateType: 'number', reloadable: true });
Config.load('billing.price-yearly-minor', { defaultValue: '10000', validateType: 'number', reloadable: true });
Config.load('billing.currency', { defaultValue: 'USD', reloadable: true });
Config.load('billing.lapse-sweep-interval-minutes', { defaultValue: '60', validateType: 'number', reloadable: true });

Config.load('fx.provider-url', { defaultValue: 'https://api.exchangerate.host' });
Config.load('fx.reconciliation-interval-minutes', { defaultValue: '60', validateType: 'number' });

Config.load('reconciliation.sweep-interval-minutes', { defaultValue: '10080', validateType: 'number', reloadable: true });
Config.load('reconciliation.streak-sample-size', { defaultValue: '25', validateType: 'number', reloadable: true });
/** How far a `last_hp_date` may lag behind a later `command_log` entry before the account is surfaced as a wedged-rollover candidate. */
Config.load('reconciliation.wedged-last-hp-lag-days', { defaultValue: '3', validateType: 'number', reloadable: true });
Config.load('reconciliation.command-log-retention-days', { defaultValue: '90', validateType: 'number', reloadable: true });
Config.load('reconciliation.command-log-prune-batch-size', { defaultValue: '1000', validateType: 'number', reloadable: true });
Config.load('reconciliation.command-log-prune-max-batches', { defaultValue: '20', validateType: 'number', reloadable: true });

Config.load('deletion.sweep-interval-minutes', { defaultValue: '5', validateType: 'number', reloadable: true });
Config.load('deletion.resume-after-minutes', { defaultValue: '15', validateType: 'number', reloadable: true });

/** Bounds one relational-purge pass: rows deleted per statement, and the number of statements before the pass yields and lets the sweep resume it. */
Config.load('deletion.purge-batch-size', { defaultValue: '1000', validateType: 'number', reloadable: true });
Config.load('deletion.purge-max-batches', { defaultValue: '1000', validateType: 'number', reloadable: true });

/**
 * Unset `identity.close-path` means no machine-side close is granted to this client yet: deletion halts at `data_deleted` and emits the operator-runbook signal.
 * `{sub}` in the path is replaced by the account's identity subject.
 */
Config.load('identity.close-service', { defaultValue: 'shadow-identity' });
Config.load('identity.close-path', { defaultValue: '' });
Config.load('identity.close-scope', { defaultValue: 'users:close' });

/** HMAC key for the analytics pseudo-id; a production deployment refuses to boot on the dev/test-only default (`TelemetryService.onModuleInit`). */
Config.load('telemetry.pseudo-id-secret', { defaultValue: DEV_PSEUDO_ID_SECRET });

/** `RequestExport` is refused once this many jobs were requested for the account in the trailing 24h. */
Config.load('export.max-per-day', { defaultValue: '1', validateType: 'number', reloadable: true });
Config.load('export.page-size', { defaultValue: '1000', validateType: 'number', reloadable: true });
Config.load('export.claim-batch-size', { defaultValue: '5', validateType: 'number', reloadable: true });
Config.load('export.assembler-interval-minutes', { defaultValue: '1', validateType: 'number', reloadable: true });
/** Exports are a delivery mechanism, not retention: the manifest object and its row are deleted this many days after assembly. */
Config.load('export.retention-days', { defaultValue: '7', validateType: 'number', reloadable: true });
Config.load('export.cleanup-interval-minutes', { defaultValue: '60', validateType: 'number', reloadable: true });
Config.load('export.download-presign-seconds', { defaultValue: '900', validateType: 'number', reloadable: true });

/** `billing-reminder-lead-days` is how far ahead of a trial/renewal expiry the reminder fires; grace and lapse fire immediately, keyed by their own state+date dedupe. */
Config.load('notifications.sender-poll-interval-minutes', { defaultValue: '1', validateType: 'number', reloadable: true });
Config.load('notifications.sender-batch-size', { defaultValue: '50', validateType: 'number', reloadable: true });
Config.load('notifications.sender-max-attempts', { defaultValue: '5', validateType: 'number', reloadable: true });
Config.load('notifications.billing-sweep-interval-minutes', { defaultValue: '60', validateType: 'number', reloadable: true });
Config.load('notifications.billing-reminder-lead-days', { defaultValue: '3', validateType: 'number', reloadable: true });
Config.load('notifications.digest-sweep-interval-minutes', { defaultValue: '60', validateType: 'number', reloadable: true });
