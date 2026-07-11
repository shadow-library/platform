/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export interface ScimName {
  givenName?: string;
  familyName?: string;
}

export interface ScimEmail {
  value: string;
  primary?: boolean;
  type?: string;
}

export interface ScimMemberRef {
  value: string;
  display?: string;
}

export interface ScimMeta {
  resourceType: 'User' | 'Group';
  created: string;
  lastModified: string;
  location: string;
}

export interface ScimUserResource {
  schemas: string[];
  id: string;
  externalId?: string;
  userName: string;
  active: boolean;
  name?: ScimName;
  displayName?: string;
  emails: ScimEmail[];
  groups: ScimMemberRef[];
  meta: ScimMeta;
}

export interface ScimGroupResource {
  schemas: string[];
  id: string;
  externalId?: string;
  displayName: string;
  members: ScimMemberRef[];
  meta: ScimMeta;
}

export interface ScimListResponse<T> {
  schemas: string[];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: T[];
}

export interface ScimPatchOperation {
  op: string;
  path?: string;
  value?: unknown;
}

export interface ScimUserInput {
  userName: string;
  externalId?: string;
  active: boolean;
  name: ScimName;
  displayName?: string;
}

export interface ScimGroupInput {
  displayName: string;
  externalId?: string;
  members: string[];
}

export interface ScimFilter {
  attribute: 'userName' | 'externalId' | 'displayName';
  value: string;
}

export interface ScimPage {
  startIndex: number;
  count: number;
}

/**
 * Declaring the constants
 *
 * SCIM bodies are validated at runtime rather than through class-schema DTOs (recorded deviation):
 * RFC 7644 PATCH values are polymorphic (boolean | string | object | array — Entra even sends
 * `"False"` as a string for booleans), which a static JSON schema cannot express without lying.
 * Every accessor below narrows `unknown` explicitly, so the surface stays `any`-free.
 */
export const SCIM_CONTENT_TYPE = 'application/scim+json; charset=utf-8';
export const USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';
export const GROUP_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:Group';
export const LIST_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';
export const PATCH_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:PatchOp';
export const ERROR_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:Error';

export class ScimError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
    readonly scimType?: string,
  ) {
    super(detail);
  }

  toEnvelope(): Record<string, unknown> {
    return { schemas: [ERROR_SCHEMA], status: String(this.status), detail: this.detail, ...(this.scimType ? { scimType: this.scimType } : {}) };
  }
}

export function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ScimError(400, `${context} must be an object`, 'invalidValue');
  return value as Record<string, unknown>;
}

export function asString(value: unknown, context: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new ScimError(400, `${context} must be a non-empty string`, 'invalidValue');
  return value.trim();
}

export function asOptionalString(value: unknown, context: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  return asString(value, context);
}

/** Entra sends booleans as the strings "True"/"False" in PATCH values; both forms are accepted. */
export function asBoolean(value: unknown, context: string): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string' && /^(true|false)$/i.test(value)) return value.toLowerCase() === 'true';
  throw new ScimError(400, `${context} must be a boolean`, 'invalidValue');
}

export function parseUserInput(body: unknown): ScimUserInput {
  const record = asRecord(body, 'Request body');
  const name = record['name'] === undefined ? {} : asRecord(record['name'], 'name');
  return {
    userName: asString(record['userName'], 'userName'),
    externalId: asOptionalString(record['externalId'], 'externalId'),
    active: record['active'] === undefined ? true : asBoolean(record['active'], 'active'),
    name: { givenName: asOptionalString(name['givenName'], 'name.givenName'), familyName: asOptionalString(name['familyName'], 'name.familyName') },
    displayName: asOptionalString(record['displayName'], 'displayName'),
  };
}

export function parseGroupInput(body: unknown): ScimGroupInput {
  const record = asRecord(body, 'Request body');
  const rawMembers = record['members'] === undefined ? [] : record['members'];
  if (!Array.isArray(rawMembers)) throw new ScimError(400, 'members must be an array', 'invalidValue');
  const members = rawMembers.map(member => asString(asRecord(member, 'member')['value'], 'member.value'));
  return { displayName: asString(record['displayName'], 'displayName'), externalId: asOptionalString(record['externalId'], 'externalId'), members };
}

export function parsePatchOperations(body: unknown): ScimPatchOperation[] {
  const record = asRecord(body, 'Request body');
  const schemas = record['schemas'];
  if (!Array.isArray(schemas) || !schemas.includes(PATCH_SCHEMA)) throw new ScimError(400, `PATCH requires the ${PATCH_SCHEMA} schema`, 'invalidSyntax');
  const operations = record['Operations'];
  if (!Array.isArray(operations) || operations.length === 0) throw new ScimError(400, 'Operations must be a non-empty array', 'invalidSyntax');
  return operations.map(operation => {
    const op = asRecord(operation, 'Operation');
    return { op: asString(op['op'], 'op').toLowerCase(), path: asOptionalString(op['path'], 'path'), value: op['value'] };
  });
}

export function parseFilter(filter: string | undefined, allowed: ScimFilter['attribute'][]): ScimFilter | undefined {
  if (!filter) return undefined;
  const match = filter.match(/^(\w+) eq "([^"]*)"$/i);
  const attribute = allowed.find(candidate => candidate.toLowerCase() === match?.[1]?.toLowerCase());
  if (!match || !attribute) throw new ScimError(400, `Unsupported filter: only '<attribute> eq "value"' on ${allowed.join(', ')} is supported`, 'invalidFilter');
  return { attribute, value: match[2] as string };
}

export function parsePage(startIndex: string | undefined, count: string | undefined): ScimPage {
  const start = startIndex === undefined ? 1 : Number.parseInt(startIndex, 10);
  const size = count === undefined ? 100 : Number.parseInt(count, 10);
  if (Number.isNaN(start) || Number.isNaN(size)) throw new ScimError(400, 'startIndex and count must be integers', 'invalidValue');
  return { startIndex: Math.max(start, 1), count: Math.min(Math.max(size, 0), 500) };
}
