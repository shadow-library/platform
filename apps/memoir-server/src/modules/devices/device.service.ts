/**
 * Importing npm packages
 */
import { Injectable, type OnModuleInit } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { type DeltaRow, DeltaSourceRegistry, type SnapshotDeltaSource } from '@modules/sync';
import { AppErrorCode } from '@server/classes';
import { type Device } from '@server/database';

import { DeviceRepository } from './device.repository';
import { type DeviceUpsertDto } from './device.dto';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

function toDeltaRow(device: Device.Row): DeltaRow {
  return {
    id: device.id,
    userAgent: device.userAgent,
    pushOptIn: device.pushOptIn,
    reminderPrefs: device.reminderPrefs,
    lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
    lastSyncSeq: device.lastSyncSeq === null ? null : String(device.lastSyncSeq),
    createdAt: device.createdAt.toISOString(),
    updatedAt: device.updatedAt.toISOString(),
  };
}

/**
 * The push-token registry (§25). It registers its own delta domain rather than being wired into the
 * sync assembler — the projection below drops `push_subscription`, which the account's other devices
 * have no reason to hold, and only this module knows that.
 */
@Injectable()
export class DeviceService implements OnModuleInit {
  constructor(
    private readonly deviceRepository: DeviceRepository,
    private readonly registry: DeltaSourceRegistry,
  ) {}

  onModuleInit(): void {
    const source: SnapshotDeltaSource = { domain: 'devices', kind: 'snapshot', fetch: () => this.deviceRepository.list().then(devices => devices.map(toDeltaRow)) };
    this.registry.register(source);
  }

  async register(deviceId: string, body: DeviceUpsertDto): Promise<Device.Row> {
    const device = await this.deviceRepository.upsert(deviceId, {
      userAgent: body.userAgent ?? null,
      pushSubscription: body.pushSubscription ?? null,
      pushOptIn: body.pushOptIn,
      reminderPrefs: body.reminderPrefs ?? null,
    });
    if (!device) throw AppErrorCode.DEV_001.create();
    return device;
  }

  async remove(deviceId: string): Promise<void> {
    const removed = await this.deviceRepository.remove(deviceId);
    if (!removed) throw AppErrorCode.DEV_001.create();
  }
}
