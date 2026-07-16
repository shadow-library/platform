# `@shadow-library/auth`

The consumer SDK for the Shadow Apps identity platform. Every Shadow Apps service uses this package — and only this package — to authenticate users and services and to enforce permissions. It is the policy-enforcement-point (PEP) half of the platform; [Shadow Identity](../../README.md) is the decision half.

The full specification lives in [`docs/sdk.md`](../../docs/sdk.md); the task-oriented walkthrough in [`docs/service-integration-guide.md`](../../docs/service-integration-guide.md).

## Install

```sh
bun add @shadow-library/auth
```

The package is Bun-first: EdDSA (Ed25519) verification runs on `crypto.subtle` and transport is native `fetch`. `@shadow-library/common` is a required peer (`AuthError` extends its `AppError` taxonomy); the `@shadow-library/app`/`fastify` peers are only needed when you use the framework module.

## Functional core

```ts
import { AuthClient } from '@shadow-library/auth';

// usually constructed by AuthModule.forRoot() and injected; constructable directly for plain Bun processes
const auth = new AuthClient({
  issuer: 'https://identity.shadow-apps.com',
  audience: 'api://pulse',
  // in-cluster: projected k8s SA token as RFC 7523 client assertion; outside: { id, secret }
  client: { id: Bun.env.AUTH_CLIENT_ID!, assertionPath: '/var/run/secrets/shadow/identity-token' },
});

const principal = await auth.verify(bearerToken); // → AuthPrincipal, throws AuthError
const allowed = await auth.check({ action: 'posts:write', organisationId: principal.org, principal }); // → boolean, deny-by-default
const token = await auth.getServiceToken({ resource: 'api://novel-forge', scopes: ['books:read'] }); // cached + singleflight
const response = await auth.fetchService('novel-forge', '/api/v1/books', {}, { resource: 'api://novel-forge' }); // svc-DNS discovery + token, one retry on 401
```

Service discovery resolves a name to `http://<name>` (the in-cluster svc domain) by default; override per service with `SERVICE_URL_<NAME>` env variables.

## Framework guards

```ts
import { ContextService } from '@shadow-library/fastify';
import { AuthModule, Authenticated, RequirePermission, RequireScope } from '@shadow-library/auth/module';

// issuer, audience, and client resolve from AUTH_ISSUER / AUTH_AUDIENCE / AUTH_CLIENT_* env vars
export const HttpModule = FastifyModule.forRoot({ imports: [AuthModule.forRoot(), PostModule] });

@HttpController('/posts')
class PostController {
  constructor(private readonly context: ContextService) {}

  @Get()
  @Authenticated()
  list() {
    const who = this.context.getAuthPrincipal(); // installed by AuthModule; throws 401 when unauthenticated
  }

  @Post()
  @RequirePermission('posts:write')
  create() {}

  @Post('/internal/reindex')
  @RequireScope('posts:admin') // M2M callers also need an admin-configured service-access rule
  reindex() {}
}
```

`AuthModule.forRoot(...)` must be imported inside `FastifyModule.forRoot({ imports: [...] })` so the guard middleware registers against the HTTP routes. Which M2M caller may reach which route is administered centrally in the identity admin panel and loaded at startup — there is no per-route caller allowlist in code.

## OIDC relying party

```ts
import { RelyingPartyModule } from '@shadow-library/auth/module';
import { RelyingParty } from '@shadow-library/auth/rp';

// as a provider (issuer falls back to AUTH_ISSUER):
RelyingPartyModule.forRoot({ client, redirectUri: 'https://pulse.shadow-apps.com/auth/callback' });

// or directly:
const rp = new RelyingParty({ issuer, client, redirectUri: 'https://pulse.shadow-apps.com/auth/callback' });
const request = await rp.createAuthorizationUrl(); // PKCE S256 + state + nonce
const tokens = await rp.exchangeCode({ code, codeVerifier: request.codeVerifier, nonce: request.nonce });
```

## Test utilities

```ts
import { createTestIdP } from '@shadow-library/auth/testing';

const idp = await createTestIdP();
const auth = new AuthClient({ issuer: idp.issuer, audience: 'api://pulse' });
const token = await idp.issueToken({ sub: '42', audience: 'api://pulse', scopes: ['posts:read'] });
await auth.verify(token);
idp.setServiceAccess([{ callerClientId: 'svc-indexer', method: 'POST', path: '/api/v1/index' }]);
idp.stop();
```
