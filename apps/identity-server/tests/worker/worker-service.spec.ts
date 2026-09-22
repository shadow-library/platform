import { afterAll, describe, expect, it, mock } from 'bun:test';

import { setConfig } from '@shadow-library/common/testing';

import { type BackChannelLogoutService } from '@server/modules/auth/token';
import { type BotOwnershipService } from '@server/modules/identity/bot-ownership';
import { type NotificationService } from '@server/modules/infrastructure/notification';
import { type WebhookDeliveryService } from '@server/modules/infrastructure/webhook';
import { type BotKeyExpiryService } from '@server/modules/worker/bot-key-expiry.service';
import { type MaintenanceService } from '@server/modules/worker/maintenance.service';
import { MAINTENANCE_EVERY_TICKS, WorkerService } from '@server/modules/worker/worker.service';

interface Tickable {
  tick(): Promise<void>;
  onApplicationReady(): Promise<void>;
  onApplicationStop(): Promise<void>;
}

function buildWorker() {
  const dispatchPending = mock(() => Promise.resolve(0));
  const recoverStuckDeliveries = mock(() => Promise.resolve(0));
  const remindExpiringKeys = mock(() => Promise.resolve(0));
  const sweepExpiredKeys = mock(() => Promise.resolve(0));
  const purgeStaleContactClaims = mock(() => Promise.resolve(0));
  const purgeStaleAppSessions = mock(() => Promise.resolve(0));
  const drainTransfers = mock(() => Promise.resolve(0));
  const recoverCompletedDeletions = mock(() => Promise.resolve(0));

  const notificationService = { dispatchPending, recoverStuckDeliveries } as unknown as NotificationService;
  const backChannelLogoutService = { dispatchPending, recoverStuckDeliveries } as unknown as BackChannelLogoutService;
  const webhookDeliveryService = { dispatchPending, recoverStuckDeliveries } as unknown as WebhookDeliveryService;
  const maintenanceService = { purgeStaleContactClaims, purgeStaleAppSessions } as unknown as MaintenanceService;
  const botKeyExpiryService = { remindExpiringKeys, sweepExpiredKeys } as unknown as BotKeyExpiryService;
  const botOwnershipService = { dispatchPending: drainTransfers, recoverCompletedDeletions } as unknown as BotOwnershipService;

  const worker = new WorkerService(
    notificationService,
    backChannelLogoutService,
    webhookDeliveryService,
    maintenanceService,
    botKeyExpiryService,
    botOwnershipService,
  ) as unknown as Tickable;
  return { worker, drainTransfers, recoverCompletedDeletions, remindExpiringKeys, sweepExpiredKeys, purgeStaleContactClaims, purgeStaleAppSessions };
}

describe('WorkerService', () => {
  const restoreConfig = setConfig({ 'worker.poll-interval': 60_000 });
  afterAll(restoreConfig);

  it('should run the bot key expiry reminder and sweep on the same cadence as the other maintenance jobs', async () => {
    const { worker, remindExpiringKeys, sweepExpiredKeys, purgeStaleContactClaims, purgeStaleAppSessions } = buildWorker();

    await worker.tick();

    expect(purgeStaleContactClaims).toHaveBeenCalledTimes(1);
    expect(purgeStaleAppSessions).toHaveBeenCalledTimes(1);
    expect(remindExpiringKeys).toHaveBeenCalledTimes(1);
    expect(sweepExpiredKeys).toHaveBeenCalledTimes(1);
  });

  it('should drain the bot ownership transfer outbox on every tick', async () => {
    const { worker, drainTransfers } = buildWorker();

    await worker.tick();
    await worker.tick();

    expect(drainTransfers).toHaveBeenCalledTimes(2);
  });

  /** The boot path is the crash recovery this sweep exists for: a worker killed between a transfer landing and its bot being finalised. */
  it('should sweep bot deletions stranded by an interrupted worker on startup', async () => {
    const { worker, recoverCompletedDeletions } = buildWorker();

    await worker.onApplicationReady();
    await worker.onApplicationStop();

    expect(recoverCompletedDeletions).toHaveBeenCalledTimes(1);
  });

  it('should sweep stranded bot deletions again only once the maintenance cadence comes round', async () => {
    const { worker, recoverCompletedDeletions } = buildWorker();

    for (let tick = 0; tick < MAINTENANCE_EVERY_TICKS; tick++) await worker.tick();
    expect(recoverCompletedDeletions).toHaveBeenCalledTimes(1);

    await worker.tick();
    expect(recoverCompletedDeletions).toHaveBeenCalledTimes(2);
  });

  it('should not rerun the expiry jobs on every tick, only on the maintenance cadence', async () => {
    const { worker, remindExpiringKeys, sweepExpiredKeys } = buildWorker();

    for (let tick = 0; tick < MAINTENANCE_EVERY_TICKS; tick++) await worker.tick();

    expect(remindExpiringKeys).toHaveBeenCalledTimes(1);
    expect(sweepExpiredKeys).toHaveBeenCalledTimes(1);
  });
});
