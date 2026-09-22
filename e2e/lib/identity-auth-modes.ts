/**
 * Importing npm packages
 */
import { type APIRequestContext } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { identityDb } from './db';
import { identityMutate } from './identity-auth';
import { redisDel } from './redis';

/**
 * Defining types
 */

export type BuiltInAuthMode = 'PASSWORD' | 'WEBAUTHN' | 'EMAIL_OTP' | 'SMS_OTP';

export interface AuthModeSnapshot {
  readonly method: BuiltInAuthMode;
  /** `undefined` when no override row existed and the mode ran on its registry default. */
  readonly row?: { isEnabled: boolean; updatedBy: string | null; updatedAt: Date };
}

/**
 * Declaring the constants
 *
 * Auth modes are global: one `auth_mode_settings` row per overridden method, cached by identity in Redis under `auth_modes` for
 * five minutes. A spec that flips one snapshots the row first and puts it back exactly, dropping the cache so the restored state is
 * what identity reads next.
 */

const AUTH_MODES_CACHE_KEY = 'auth_modes';

export class AuthModeError extends Error {
  override readonly name = 'AuthModeError';
}

export async function snapshotAuthMode(method: BuiltInAuthMode): Promise<AuthModeSnapshot> {
  const [row] = await identityDb()<{ isEnabled: boolean; updatedBy: string | null; updatedAt: Date }[]>`
    SELECT is_enabled AS "isEnabled", updated_by::text AS "updatedBy", updated_at AS "updatedAt" FROM auth_mode_settings WHERE method = ${method}
  `;
  return row ? { method, row } : { method };
}

export async function restoreAuthMode(snapshot: AuthModeSnapshot): Promise<void> {
  const sql = identityDb();
  const { method, row } = snapshot;
  if (row) {
    await sql`
      INSERT INTO auth_mode_settings (method, is_enabled, updated_by, updated_at) VALUES (${method}, ${row.isEnabled}, ${row.updatedBy}, ${row.updatedAt})
      ON CONFLICT (method) DO UPDATE SET is_enabled = EXCLUDED.is_enabled, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at
    `;
  } else {
    await sql`DELETE FROM auth_mode_settings WHERE method = ${method}`;
  }
  await redisDel(AUTH_MODES_CACHE_KEY);
}

/** `PUT /api/v1/admin/auth-modes/:method` on an elevated admin context. */
export async function setAuthMode(admin: APIRequestContext, method: BuiltInAuthMode, enabled: boolean): Promise<void> {
  const response = await identityMutate(admin, 'put', `/api/v1/admin/auth-modes/${method}`, { enabled });
  if (response.status() !== 200) throw new AuthModeError(`set ${method}=${enabled} answered ${response.status()}: ${await response.text()}`);
}
