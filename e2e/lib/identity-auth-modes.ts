/**
 * Importing npm packages
 */
import { type APIRequestContext, type APIResponse } from '@playwright/test';

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

/** Every method `GET /api/v1/admin/auth-modes` lists, in the order it lists them. */
export const AUTH_MODES = ['PASSWORD', 'WEBAUTHN', 'EMAIL_OTP', 'SMS_OTP', 'GOOGLE', 'MICROSOFT', 'APPLE'] as const;

export type AuthModeName = (typeof AUTH_MODES)[number];

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
export function putAuthMode(admin: APIRequestContext, method: string, enabled: boolean): Promise<APIResponse> {
  return identityMutate(admin, 'put', `/api/v1/admin/auth-modes/${method}`, { enabled });
}

/** `putAuthMode`, throwing unless identity answers 200. */
export async function setAuthMode(admin: APIRequestContext, method: AuthModeName, enabled: boolean): Promise<void> {
  const response = await putAuthMode(admin, method, enabled);
  if (response.status() !== 200) throw new AuthModeError(`set ${method}=${enabled} answered ${response.status()}: ${await response.text()}`);
}

export interface AuthModeItem {
  method: AuthModeName;
  kind: 'BUILT_IN' | 'SOCIAL';
  enabled: boolean;
  configured: boolean;
  provider?: { id: string; kind: string; clientId: string; isActive: boolean };
}

export async function listAuthModes(admin: APIRequestContext): Promise<AuthModeItem[]> {
  const response = await admin.get('/api/v1/admin/auth-modes');
  if (response.status() !== 200) throw new AuthModeError(`list auth modes answered ${response.status()}: ${await response.text()}`);
  return ((await response.json()) as { items: AuthModeItem[] }).items;
}
