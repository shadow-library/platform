import { InferSelectModel } from 'drizzle-orm';
import { bigint, boolean, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

export type AuthModeSetting = InferSelectModel<typeof authModeSettings>;

/**
 * Platform-wide overrides for the sign-in methods declared in `AUTH_MODE_REGISTRY`; an absent row means
 * the registry default still applies. Social providers are deliberately absent — their switch is
 * `identity_providers.is_active` on the global row, so there is exactly one source of truth per mode.
 */
export const authModeSettings = pgTable('auth_mode_settings', {
  method: varchar('method', { length: 64 }).primaryKey(),
  isEnabled: boolean('is_enabled').notNull(),
  updatedBy: bigint('updated_by', { mode: 'bigint' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
