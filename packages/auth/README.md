# `@shadow-library/auth`

The consumer SDK for the Shadow Apps identity platform. Every Shadow Apps service uses this package — and only this package — to authenticate users and services and to enforce permissions. It is the policy-enforcement-point (PEP) half of the platform; [Shadow Identity](../../README.md) is the decision half.

The full specification lives in [`docs/sdk.md`](../../docs/sdk.md).

## Install

```sh
bun add @shadow-library/auth
```

The package is Bun-first: EdDSA (Ed25519) verification runs on `crypto.subtle`, transport is native `fetch`, and there are zero runtime dependencies. The `@shadow-library/app`/`fastify`/`common` peers are only needed when you use the framework module.

## Functional core

```ts
import { createAuthClient } from '@shadow-library/auth';

const auth = createAuthClient({
  issuer: 'https://identity.shadow-apps.com',
  audience: 'api://pulse',
  client: { id: Bun.env.IDENTITY_CLIENT_ID!, secret: Bun.env.IDENTITY_CLIENT_SECRET },
});

const principal = await auth.verify(bearerToken); // → AuthPrincipal, throws AuthError
const allowed = await auth.check({ action: 'posts:write', organisationId: principal.org, principal }); // → boolean, deny-by-default
const token = await auth.getServiceToken({ resource: 'api://novel-forge', scopes: ['books:read'] }); // cached + singleflight
const response = await auth.fetch(url, { method: 'POST' }, { resource: 'api://novel-forge' }); // token injected, one retry on 401
```

## Framework guards

```ts
import { AuthModule, Authenticated, RequirePermission, RequireScope, AllowService, getPrincipal } from '@shadow-library/auth/module';

@Module({ imports: [AuthModule.forRoot({ issuer, audience, client })] })
class RoutesModule {}

@HttpController('/posts')
class PostController {
  @Get()
  @Authenticated()
  list(@Req() request: FastifyRequest) {
    const who = getPrincipal(request);
  }

  @Post()
  @RequirePermission('posts:write')
  create() {}

  @Post('/internal/reindex')
  @AllowService('svc-indexer')
  @RequireScope('posts:admin')
  reindex() {}
}
```

`AuthModule.forRoot(...)` must be imported inside `FastifyModule.forRoot({ imports: [...] })` so the guard middleware registers against the HTTP routes.

## OIDC relying party

```ts
import { createRelyingParty } from '@shadow-library/auth/rp';

const rp = createRelyingParty({ issuer, client, redirectUri: 'https://pulse.shadow-apps.com/auth/callback' });
const request = await rp.createAuthorizationUrl(); // PKCE S256 + state + nonce
const tokens = await rp.exchangeCode({ code, codeVerifier: request.codeVerifier, nonce: request.nonce });
```

## Test utilities

```ts
import { createTestIdP } from '@shadow-library/auth/testing';

const idp = await createTestIdP();
const auth = createAuthClient({ issuer: idp.issuer, audience: 'api://pulse' });
const token = await idp.issueToken({ sub: '42', audience: 'api://pulse', scopes: ['posts:read'] });
await auth.verify(token);
idp.stop();
```
