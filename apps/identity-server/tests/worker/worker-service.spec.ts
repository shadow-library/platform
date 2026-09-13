import { describe, expect, it, mock } from 'bun:test';

import '@server/bootstrap';
import { BackChannelLogoutService } from '@server/modules/auth/token';
import { NotificationService } from '@server/modules/infrastructure/notification';
import { WebhookDeliveryService } from '@server/modules/infrastructure/webhook';
import { BotKeyExpiryService, WorkerService } from '@server/modules/worker';
import { MaintenanceService } from '@server/modules/worker/maintenance.service';

interface Tickable {
  tick(): Promise<void>;
}

function buildWorker() {
  const dispatchPending = mock(() => Promise.resolve(0));
  const remindExpiringKeys = mock(() => Promise.resolve(0));
  const sweepExpiredKeys = mock(() => Promise.resolve(0));
  const purgeStaleContactClaims = mock(() => Promise.resolve(0));
  const purgeStaleAppSessions = mock(() => Promise.resolve(0));

  const notificationService = { dispatchPending } as unknown as NotificationService;
  const backChannelLogoutService = { dispatchPending } as unknown as BackChannelLogoutService;
  const webhookDeliveryService = { dispatchPending } as unknown as WebhookDeliveryService;
  const maintenanceService = { purgeStaleContactClaims, purgeStaleAppSessions } as unknown as MaintenanceService;
  const botKeyExpiryService = { remindExpiringKeys, sweepExpiredKeys } as unknown as BotKeyExpiryService;

  const worker = new WorkerService(notificationService, backChannelLogoutService, webhookDeliveryService, maintenanceService, botKeyExpiryService) as unknown as Tickable;
  return { worker, remindExpiringKeys, sweepExpiredKeys, purgeStaleContactClaims, purgeStaleAppSessions };
}

describe('WorkerService', () => {
  it('should run the bot key expiry reminder and sweep on the same cadence as the other maintenance jobs', async () => {
    const { worker, remindExpiringKeys, sweepExpiredKeys, purgeStaleContactClaims, purgeStaleAppSessions } = buildWorker();

    await worker.tick();

    expect(purgeStaleContactClaims).toHaveBeenCalledTimes(1);
    expect(purgeStaleAppSessions).toHaveBeenCalledTimes(1);
    expect(remindExpiringKeys).toHaveBeenCalledTimes(1);
    expect(sweepExpiredKeys).toHaveBeenCalledTimes(1);
  });

  it('should not rerun the expiry jobs on every tick, only on the maintenance cadence', async () => {
    const { worker, remindExpiringKeys, sweepExpiredKeys } = buildWorker();

    await worker.tick();
    for (let i = 0; i < 10; i++) await worker.tick();

    expect(remindExpiringKeys).toHaveBeenCalledTimes(1);
    expect(sweepExpiredKeys).toHaveBeenCalledTimes(1);
  });
});
