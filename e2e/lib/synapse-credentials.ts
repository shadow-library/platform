import { randomBytes } from 'node:crypto';

import { type APIRequestContext, type APIResponse } from '@playwright/test';

import { mutate } from './api';
import { synapseDb } from './db';

export interface CredentialItem {
  readonly id: string;
  readonly name: string;
  readonly allowedOrigin: string;
  readonly hint: string;
  readonly version: number;
  readonly kid?: string;
  readonly createdBy?: string;
  readonly createdAt: string;
  readonly rotatedAt?: string;
  readonly revokedAt?: string;
  readonly referencedBy: string[];
}

export interface CreatedCredential extends CredentialItem {
  readonly secret: string;
}

export interface CredentialProbe {
  readonly ok: boolean;
  readonly code?: string;
}

export interface KeyringStatus {
  readonly activeKeyId: string;
  readonly keys: { kid: string; credentials: number; inKeyring: boolean }[];
}

export interface CredentialOptions {
  label?: string;
  allowedOrigin?: string;
  secret?: string;
}

export interface CredentialRow {
  readonly secret: Record<string, unknown>;
  readonly secretText: string;
  readonly version: number;
  readonly revokedAt: Date | null;
}

export interface CredentialEventRow {
  readonly action: 'create' | 'rotate' | 'revoke';
  readonly actor: string;
}

export const CREDENTIALS_PATH = '/api/v1/admin/credentials';
export const E2E_CREDENTIAL_PREFIX = 'e2e-';

export class SynapseCredentialError extends Error {
  override readonly name = 'SynapseCredentialError';
}

export function fakeSecret(): string {
  return `e2e-fake-${randomBytes(20).toString('hex')}`;
}

export function uniqueCredentialName(label = 'cred'): string {
  return `${E2E_CREDENTIAL_PREFIX}${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${randomBytes(4).toString('hex')}`;
}

export function unreachableOrigin(): string {
  return `https://e2e-${randomBytes(6).toString('hex')}.invalid`;
}

export function listCredentials(ctx: APIRequestContext): Promise<APIResponse> {
  return ctx.get(CREDENTIALS_PATH);
}

export function getCredential(ctx: APIRequestContext, id: string): Promise<APIResponse> {
  return ctx.get(`${CREDENTIALS_PATH}/${id}`);
}

export function registerCredential(ctx: APIRequestContext, body: Record<string, unknown>): Promise<APIResponse> {
  return mutate(ctx, 'post', CREDENTIALS_PATH, { data: body });
}

export function rotateCredentialSecret(ctx: APIRequestContext, id: string, secret: string): Promise<APIResponse> {
  return mutate(ctx, 'put', `${CREDENTIALS_PATH}/${id}/secret`, { data: { secret } });
}

export function testCredential(ctx: APIRequestContext, id: string): Promise<APIResponse> {
  return mutate(ctx, 'post', `${CREDENTIALS_PATH}/${id}/test`);
}

export function revokeCredential(ctx: APIRequestContext, id: string): Promise<APIResponse> {
  return mutate(ctx, 'delete', `${CREDENTIALS_PATH}/${id}`);
}

export function readKeyringStatus(ctx: APIRequestContext): Promise<APIResponse> {
  return ctx.get(`${CREDENTIALS_PATH}/status/keyring`);
}

export async function createCredential(ctx: APIRequestContext, options: CredentialOptions = {}): Promise<CreatedCredential> {
  const secret = options.secret ?? fakeSecret();
  const body = { name: uniqueCredentialName(options.label), allowedOrigin: options.allowedOrigin ?? unreachableOrigin(), secret };
  const response = await registerCredential(ctx, body);
  if (response.status() !== 201) throw new SynapseCredentialError(`creating ${body.name} answered ${response.status()}: ${await response.text()}`);
  return { ...((await response.json()) as CredentialItem), secret };
}

export async function readCredentialRow(id: string): Promise<CredentialRow | undefined> {
  const [row] = await synapseDb()<CredentialRow[]>`
    SELECT secret, secret::text AS "secretText", version, revoked_at AS "revokedAt" FROM provider_credentials WHERE id = ${id}
  `;
  return row;
}

export function readCredentialEvents(id: string): Promise<CredentialEventRow[]> {
  return synapseDb()<CredentialEventRow[]>`SELECT action, actor FROM credential_events WHERE credential_id = ${id} ORDER BY id`;
}

/** A revoked credential keeps its name forever, so a spec's rows are the only ones removed, and only those carrying the e2e prefix. */
export async function deleteCredentialRecords(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const sql = synapseDb();
  const owned = await sql<{ id: string }[]>`SELECT id FROM provider_credentials WHERE id IN ${sql(ids as string[])} AND name LIKE ${`${E2E_CREDENTIAL_PREFIX}%`}`;
  if (owned.length === 0) return;
  const ownedIds = owned.map(row => row.id);
  await sql`DELETE FROM credential_events WHERE credential_id IN ${sql(ownedIds)}`;
  await sql`DELETE FROM provider_credentials WHERE id IN ${sql(ownedIds)}`;
}
