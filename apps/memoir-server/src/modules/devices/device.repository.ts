/**
 * Importing npm packages
 */
import { eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { OwnerScopedRepository } from '@modules/auth';
import { type Device, schema } from '@server/database';

/**
 * Defining types
 */

export interface DeviceUpsert {
  userAgent?: string | null;
  pushSubscription?: Record<string, unknown> | null;
  pushOptIn: boolean;
  reminderPrefs?: Record<string, unknown> | null;
}

/**
 * Declaring the constants
 */

@Injectable()
export class DeviceRepository extends OwnerScopedRepository {
  async list(): Promise<Device.Row[]> {
    return (await this.scoped(schema.devices)) as Device.Row[];
  }

  /**
   * The insert's `account_id` is the caller's, and the conflict branch is guarded on it as well, so a
   * device id minted under another account returns nothing rather than being adopted — the service reads
   * that empty result as a 404, the same answer a wholly unknown id gets.
   */
  async upsert(deviceId: string, values: DeviceUpsert): Promise<Device.Row | null> {
    const accountId = this.requireAccountId();
    const now = new Date();
    const [device] = await this.db
      .insert(schema.devices)
      .values({ id: deviceId, accountId, ...values, lastSeenAt: now })
      .onConflictDoUpdate({ target: schema.devices.id, set: { ...values, lastSeenAt: now, updatedAt: now }, setWhere: eq(schema.devices.accountId, accountId) })
      .returning();
    return device ?? null;
  }

  /** The tombstone commits with the delete so a device removed on one installation disappears from the others' local stores on their next pull. */
  async remove(deviceId: string): Promise<boolean> {
    return this.transaction(async tx => {
      const scope = this.using(tx);
      const deleted = await scope.delete(schema.devices, eq(schema.devices.id, deviceId)).returning({ id: schema.devices.id });
      if (deleted.length === 0) return false;
      await scope.tombstone('devices', deviceId);
      return true;
    });
  }
}
