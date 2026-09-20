/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/** A pattern rather than `format: 'uuid'` — fastify's route schema compiler registers no formats and refuses to build a route carrying one. */
const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

@Schema()
export class DeviceIdParams {
  @Field({ pattern: UUID_PATTERN, description: 'Client-minted UUID identifying this installation; the client keeps it across sessions' })
  deviceId: string;
}

@Schema()
export class DeviceUpsertDto {
  @Field({ optional: true, maxLength: 300, description: 'User agent as the device reports it, for the account owner to tell their own devices apart' })
  userAgent?: string;

  @Field(() => Object, { additionalProperties: true, optional: true, description: 'Web Push subscription for this device; omit to leave any stored subscription untouched' })
  pushSubscription?: Record<string, unknown>;

  @Field({ default: false, description: 'Whether this device wants push notifications at all' })
  pushOptIn: boolean;

  @Field(() => Object, { additionalProperties: true, optional: true, description: 'Per-device reminder preferences, layered over the account-level notification prefs' })
  reminderPrefs?: Record<string, unknown>;
}

@Schema()
export class DeviceResponseDto {
  @Field()
  id: string;

  @Field({ optional: true, nullable: true })
  userAgent?: string | null;

  @Field()
  pushOptIn: boolean;

  @Field(() => Object, { additionalProperties: true, optional: true, nullable: true })
  pushSubscription?: Record<string, unknown> | null;

  @Field(() => Object, { additionalProperties: true, optional: true, nullable: true })
  reminderPrefs?: Record<string, unknown> | null;

  @Field({ optional: true, nullable: true, format: 'date-time' })
  lastSeenAt?: string | null;

  @Field(() => String, { optional: true, nullable: true, description: 'The delta cursor this device last acknowledged' })
  lastSyncSeq?: bigint | null;

  @Field({ format: 'date-time' })
  createdAt: string;

  @Field({ format: 'date-time' })
  updatedAt: string;
}
