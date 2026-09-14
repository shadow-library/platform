/**
 * The registry key for a bot-aware application: it exposes `<application>:bots:manage` on its own
 * `api://<application>` resource and identity's outbound service client holds that scope. Both halves
 * are seeded together in `ecosystem-seed.constants.ts`, so an application becomes bot-aware by
 * declaring the scope and the matching `/internal/bots/*` service-access rule — never by being listed
 * here.
 */
export const BOT_MANAGE_SCOPE_SUFFIX = ':bots:manage';

/** Backend workloads are deployed as `<application>-server`; `svc://` resolves that to the cluster Service. */
export const botOwnershipUrl = (application: string, botId: bigint, path: 'ownership' | 'transfer'): string => `svc://${application}-server/internal/bots/${botId}/${path}`;

/** A person is waiting on the fan-out, so a silent application is reported as unavailable rather than stalling the response. */
export const OWNERSHIP_LOOKUP_TIMEOUT_MS = 3_000;

export const OWNERSHIP_TRANSFER_TIMEOUT_MS = 10_000;

/** With the backoff below, roughly six hours of retries (2+4+8+16+32 then five at the 60-minute ceiling) before an admin has to intervene. */
export const MAX_TRANSFER_ATTEMPTS = 10;

/** Claimed rows are dispatched concurrently, so this bounds outbound fan-out per tick rather than the tick's duration. */
export const TRANSFER_BATCH_LIMIT = 20;

export const MAX_TRANSFER_BACKOFF_MINUTES = 60;
