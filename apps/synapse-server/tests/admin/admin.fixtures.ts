import { type AuthClient, type AuthPrincipal } from '@shadow-library/auth';
import { AUTH_PRINCIPAL, extendContextWithAuth } from '@shadow-library/auth/module';
import { AppError, type ErrorCode } from '@shadow-library/common';
import { ContextService, type HttpResponse } from '@shadow-library/fastify';
import { expect } from 'bun:test';

import { SYNAPSE_ROLES } from '@modules/auth';
import { type ActiveCatalogCache } from '@modules/catalog';
import { CallerService } from '@modules/admin/caller.service';
import { type LedgerReportRepository } from '@modules/admin/ledger-report.repository';
import { type CatalogDocument } from '@modules/catalog/catalog.types';

import { catalogDocument } from '../catalog/catalog.fixtures';

export const context = new ContextService();
extendContextWithAuth(context);

export const NOVEL_FORGE: AuthPrincipal = { kind: 'service', sub: 'novel-forge', clientId: 'novel-forge', scopes: ['synapse:catalog:read'], claims: {} };
export const MEMOIR: AuthPrincipal = { kind: 'service', sub: 'memoir', clientId: 'memoir', scopes: ['synapse:catalog:read'], claims: {} };
export const ANONYMOUS_SERVICE: AuthPrincipal = { kind: 'service', sub: 'unknown', scopes: [], claims: {} };
export const BOT: AuthPrincipal = { kind: 'bot', sub: 'bot_1', clientId: 'bot_1', scopes: [], org: '1', botId: '1', keyId: 'key-1', rateLimitPerMinute: 60, claims: {} };

export function userWith(role: keyof typeof SYNAPSE_ROLES): AuthPrincipal {
  return { kind: 'user', sub: `user-${role}`, org: '1', scopes: [], claims: {} };
}

const ROLE_BY_SUBJECT = new Map(Object.entries(SYNAPSE_ROLES).map(([role, definition]) => [`user-${role}`, new Set<string>(definition.permissions)]));

export const checkOptions: { action: string; highRisk?: boolean }[] = [];

export const authClient = {
  checkAll: async (inputs: { action: string; principal: AuthPrincipal }[], options?: { highRisk?: boolean }): Promise<boolean[]> => {
    for (const input of inputs) checkOptions.push({ action: input.action, highRisk: options?.highRisk });
    return inputs.map(input => ROLE_BY_SUBJECT.get(input.principal.sub)?.has(input.action) ?? false);
  },
} as unknown as AuthClient;

export const caller = new CallerService(context, authClient);

export function asPrincipal<T>(principal: AuthPrincipal, work: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const hook = context.init() as unknown as (request: unknown, response: unknown, done: () => void) => void;
    hook({ id: 'admin-test' }, {}, () => {
      context.set(AUTH_PRINCIPAL, principal);
      work().then(resolve, reject);
    });
  });
}

export async function failure(operation: Promise<unknown>): Promise<AppError> {
  const error = await operation.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!AppError.is(error)) throw new TypeError(`expected an AppError, got ${String(error)}`);
  return error;
}

export async function expectFailure(operation: Promise<unknown>, code: ErrorCode): Promise<AppError> {
  const error = await failure(operation);
  expect(error.code).toBe(code.code);
  return error;
}

export class FakeReply {
  statusCode = 200;
  headers: Record<string, string> = {};
  body: unknown;
  sent = false;

  header(name: string, value: string): this {
    this.headers[name] = value;
    return this;
  }

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  send(body?: unknown): this {
    this.body = body;
    this.sent = true;
    return this;
  }

  asResponse(): HttpResponse {
    return this as unknown as HttpResponse;
  }
}

export function fakeCache(document: CatalogDocument = catalogDocument(), version = 3): ActiveCatalogCache {
  return { requireCurrent: () => ({ version, document }) } as unknown as ActiveCatalogCache;
}

export function fakeLedger(overrides: Partial<Record<keyof LedgerReportRepository, unknown>> = {}): LedgerReportRepository {
  return { usage: async () => [], usageSeries: async () => [], aliasUsage: async () => [], providerOutcomes: async () => [], ...overrides } as unknown as LedgerReportRepository;
}
