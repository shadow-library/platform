/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { identityDb } from './db';
import { requireProductUrl } from './env';
import { identityMutate } from './identity-auth';
import { type AuthnRequest } from './saml-sp';

/**
 * Defining types
 */

export type SamlNameIdFormat = 'EMAIL' | 'PERSISTENT';

export interface SamlSpOptions {
  /** Readable tag inside the generated entity id and name. */
  label?: string;
  entityId?: string;
  acsUrl?: string;
  /** Links the provider to an application, which gates the assertion on that application's access rules. */
  applicationId?: number;
  nameIdFormat?: SamlNameIdFormat;
  releasedAttributes?: string[];
}

export interface SamlSpBody {
  readonly entityId: string;
  readonly name: string;
  readonly acsUrl: string;
  readonly applicationId?: number;
  readonly nameIdFormat?: SamlNameIdFormat;
  readonly releasedAttributes?: string[];
}

export interface SamlSp {
  readonly id: string;
  readonly entityId: string;
  readonly name: string;
  readonly acsUrl: string;
  readonly nameIdFormat: SamlNameIdFormat;
  readonly releasedAttributes: string[];
  readonly isActive: boolean;
  readonly applicationId?: number;
}

export interface SamlSpPatch {
  name?: string;
  acsUrl?: string;
  applicationId?: number | null;
  nameIdFormat?: SamlNameIdFormat;
  releasedAttributes?: string[];
  isActive?: boolean;
}

/**
 * Declaring the constants
 *
 * Admin-side SAML service-provider management plus the two public `/saml2` calls a spec drives. Both public calls ask
 * for no content encoding: a compressed `/saml2` reply arrives with an empty body in this deployment (asserted by the
 * `test.fixme` in `tests/identity/saml.spec.ts`), so a spec that wants to read the document has to opt out of it.
 */

const ADMIN_PATH = '/api/v1/admin/saml/service-providers';

const UNCOMPRESSED = { 'accept-encoding': 'identity' };

export class IdentitySamlError extends Error {
  override readonly name = 'IdentitySamlError';
}

/** A registration body for a service provider nothing else in the suite owns — the `entity_id` column is globally unique. */
export function samlSpBody(options: SamlSpOptions = {}): SamlSpBody {
  const tag = `${options.label ?? 'sp'}-${randomBytes(4).toString('hex')}`;
  const entityId = options.entityId ?? `https://e2e-${tag}.example.test`;
  return {
    entityId,
    name: `e2e-${tag}`,
    acsUrl: options.acsUrl ?? `${entityId}/acs`,
    ...(options.applicationId === undefined ? {} : { applicationId: options.applicationId }),
    ...(options.nameIdFormat === undefined ? {} : { nameIdFormat: options.nameIdFormat }),
    ...(options.releasedAttributes === undefined ? {} : { releasedAttributes: options.releasedAttributes }),
  };
}

export function registerSamlSp(admin: APIRequestContext, body: Record<string, unknown>): Promise<APIResponse> {
  return identityMutate(admin, 'post', ADMIN_PATH, body);
}

export async function createSamlSp(admin: APIRequestContext, options: SamlSpOptions = {}): Promise<SamlSp> {
  const body = samlSpBody(options);
  const response = await registerSamlSp(admin, { ...body });
  if (response.status() !== 201) throw new IdentitySamlError(`registering ${body.entityId} answered ${response.status()}: ${await response.text()}`);
  return (await response.json()) as SamlSp;
}

export function patchSamlSp(admin: APIRequestContext, serviceProviderId: string, patch: SamlSpPatch): Promise<APIResponse> {
  return identityMutate(admin, 'patch', `${ADMIN_PATH}/${serviceProviderId}`, patch);
}

export function removeSamlSp(admin: APIRequestContext, serviceProviderId: string): Promise<APIResponse> {
  return identityMutate(admin, 'delete', `${ADMIN_PATH}/${serviceProviderId}`);
}

export function getSamlSp(admin: APIRequestContext, serviceProviderId: string): Promise<APIResponse> {
  return admin.get(`${ADMIN_PATH}/${serviceProviderId}`);
}

export function listSamlSps(caller: APIRequestContext): Promise<APIResponse> {
  return caller.get(ADMIN_PATH);
}

/** Removes the row a spec registered, whether or not the spec already deleted it through the API. */
export async function deleteSamlSpRecord(serviceProviderId: string): Promise<void> {
  await identityDb()`DELETE FROM saml_service_providers WHERE id = ${serviceProviderId}::uuid`;
}

export function getSamlMetadata(ctx: APIRequestContext): Promise<APIResponse> {
  return ctx.get('/saml2/metadata', { headers: UNCOMPRESSED });
}

/** Starts SP-initiated sign-on. The redirect to the login page is reported, not followed. */
export function startSamlSso(ctx: APIRequestContext, request: AuthnRequest, relayState?: string): Promise<APIResponse> {
  const query = new URLSearchParams({ SAMLRequest: request.encoded, ...(relayState ? { RelayState: relayState } : {}) });
  return ctx.get(`/saml2/sso?${query.toString()}`, { headers: UNCOMPRESSED, maxRedirects: 0 });
}

/** `startSamlSso` for a raw `SAMLRequest` value, for the requests identity must refuse. */
export function startRawSamlSso(ctx: APIRequestContext, samlRequest: string): Promise<APIResponse> {
  return ctx.get(`/saml2/sso?${new URLSearchParams({ SAMLRequest: samlRequest }).toString()}`, { headers: UNCOMPRESSED, maxRedirects: 0 });
}

export function resumeSamlSso(ctx: APIRequestContext, resumeId: string): Promise<APIResponse> {
  return ctx.get(`/saml2/sso/resume?${new URLSearchParams({ rid: resumeId }).toString()}`, { headers: UNCOMPRESSED, maxRedirects: 0 });
}

/** The `rid` identity parked the request under, read out of the `return_to` it sent the browser to the login page with. */
export function parkedResumeId(location: string): string {
  const returnTo = new URL(location, requireProductUrl('identity')).searchParams.get('return_to');
  const resumeId = returnTo ? new URL(returnTo).searchParams.get('rid') : null;
  if (!resumeId) throw new IdentitySamlError(`no parked request id in ${location}`);
  return resumeId;
}
