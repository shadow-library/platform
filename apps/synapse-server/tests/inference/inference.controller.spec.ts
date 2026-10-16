import { describe, expect, it } from 'bun:test';

import { type HandlerMetadata } from '@shadow-library/app';
import { type AuthClient, type AuthPrincipal } from '@shadow-library/auth';
import { AuthAccessPolicy, AuthGuard, type AuthGuardHandler, extendContextWithAuth } from '@shadow-library/auth/module';
import { AppError } from '@shadow-library/common';
import { ContextService } from '@shadow-library/fastify';

import { callingApp } from '@modules/inference/calling-app.util';
import { InferenceController } from '@modules/inference/inference.controller';

const CALLER: AuthPrincipal = { kind: 'service', sub: 'novel-forge', clientId: 'novel-forge', scopes: ['synapse:infer', 'synapse:catalog:read'], claims: {} };
const CATALOG_ONLY: AuthPrincipal = { kind: 'service', sub: 'memoir', clientId: 'memoir', scopes: ['synapse:catalog:read'], claims: {} };
const USER: AuthPrincipal = { kind: 'user', sub: 'admin', org: '1', scopes: ['synapse:infer'], claims: {} };

const client = {
  verify: (token: string) => Promise.resolve([CALLER, CATALOG_ONLY, USER].find(principal => principal.sub === token)),
  isServiceCallerAllowed: () => true,
} as unknown as AuthClient;

const context = new ContextService();
extendContextWithAuth(context);
const guard = new AuthGuard(client, context, new AuthAccessPolicy('public'));

const ROUTES = ['chatCompletions', 'embeddings', 'imageGenerations'] as const;

const metadataOf = (target: object): HandlerMetadata => {
  const key = Reflect.getMetadataKeys(target).find(candidate => typeof candidate === 'symbol' && candidate.description === 'handler-metadata');
  return Reflect.getMetadata(key, target) as HandlerMetadata;
};

/** The router merges the class-level access policy into each route; no route overrides it, so a shallow merge is the same */
function handlerMetadata(method: (typeof ROUTES)[number]): HandlerMetadata {
  return { ...metadataOf(InferenceController), ...metadataOf(InferenceController.prototype[method]) };
}

function refusalOf(method: (typeof ROUTES)[number], principal: AuthPrincipal): Promise<string | null> {
  const handler = guard.generate(handlerMetadata(method)) as AuthGuardHandler;
  return new Promise(resolve => {
    const hook = context.init() as unknown as (request: unknown, response: unknown, done: () => void) => void;
    hook({ id: 'guard-rid' }, {}, () => {
      handler({ headers: { authorization: `Bearer ${principal.sub}` } }).then(
        () => resolve(null),
        (error: unknown) => resolve(AppError.is(error) ? error.code : 'unexpected'),
      );
    });
  });
}

describe('InferenceController', () => {
  it('should admit a service token carrying the inference scope on every route', async () => {
    for (const route of ROUTES) expect([route, await refusalOf(route, CALLER)]).toEqual([route, null]);
  });

  it('should refuse a service token without the inference scope', async () => {
    for (const route of ROUTES) expect([route, await refusalOf(route, CATALOG_ONLY)]).toEqual([route, 'IAM_002']);
  });

  it('should refuse an anonymous caller', async () => {
    const handler = guard.generate(handlerMetadata('chatCompletions')) as AuthGuardHandler;
    const refusal = await new Promise(resolve => {
      const hook = context.init() as unknown as (request: unknown, response: unknown, done: () => void) => void;
      hook({ id: 'guard-rid' }, {}, () =>
        handler({ headers: {} }).then(
          () => resolve(null),
          (error: unknown) => resolve(AppError.is(error) ? error.code : null),
        ),
      );
    });
    expect(refusal).toBe('IAM_001');
  });
});

describe('callingApp', () => {
  it("should name the calling app by the service token's client id", () => {
    expect(callingApp(CALLER)).toBe('novel-forge');
  });

  it('should refuse a user, even one whose token carries the scope, and a service token naming no client', () => {
    for (const principal of [USER, { ...CALLER, clientId: undefined }]) {
      let code: string | undefined;
      try {
        callingApp(principal);
      } catch (error) {
        code = AppError.is(error) ? error.code : undefined;
      }
      expect(code).toBe('IAM_002');
    }
  });
});
