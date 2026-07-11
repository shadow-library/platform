/**
 * Importing npm packages
 */
import fs from 'fs';
import path from 'path';

import fastifyStatic from '@fastify/static';
import { Config } from '@shadow-library/common';
import { FastifyModule } from '@shadow-library/fastify';
import { HttpCoreModule } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { AdminModule } from '@server/modules/admin';
import { AuthFlowModule } from '@server/modules/auth/flow';
import { KeyModule } from '@server/modules/auth/keys';
import { MfaModule } from '@server/modules/auth/mfa';
import { OAuthModule } from '@server/modules/auth/oauth';
import { SessionModule } from '@server/modules/auth/session';
import { TokenModule } from '@server/modules/auth/token';
import { AuthzModule } from '@server/modules/authz';
import { ContactModule } from '@server/modules/identity/contact';
import { OrganisationModule } from '@server/modules/identity/organisation';
import { UserModule } from '@server/modules/identity/user';
import { AuditModule } from '@server/modules/infrastructure/audit';
import { HealthModule } from '@server/modules/infrastructure/health';
import { NotificationModule } from '@server/modules/infrastructure/notification';
import { SecurityModule } from '@server/modules/infrastructure/security';
import { UiModule } from '@server/modules/infrastructure/ui';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Routes carry explicit, full paths at the controller level rather than a global
 * prefix: an identity provider mixes unprefixed root routes (`/health`,
 * `/.well-known/*`) with the versioned `/api/v1/*` surface.
 */

export const AppHttpCoreModule = HttpCoreModule.forRoot({
  helmet: {
    /**
     * Scripts stay 'self' (the client ships no inline script); styles allow inline because the
     * Radix primitives inside @shadow-library/ui position overlays with style attributes.
     */
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
        manifestSrc: ["'self'"],
      },
    },
  },
});

export const HttpRouteModule = FastifyModule.forRoot({
  imports: [
    AppHttpCoreModule,
    SecurityModule,
    HealthModule,
    KeyModule,
    SessionModule,
    TokenModule,
    OAuthModule,
    AuthzModule,
    AuthFlowModule,
    MfaModule,
    ContactModule,
    OrganisationModule,
    UserModule,
    AuditModule,
    NotificationModule,
    AdminModule,
    UiModule,
  ],

  /** Immutable, fingerprint-friendly delivery for the built client; pages are served no-store by UiController. */
  fastifyFactory: async instance => {
    const assetsDir = path.join(Config.get('ui.public-dir'), 'assets');
    if (fs.existsSync(assetsDir)) await instance.register(fastifyStatic, { root: assetsDir, prefix: '/assets/', index: false, maxAge: '1d', etag: true });
    return instance;
  },

  host: Config.get('server.host'),
  port: Config.get('server.port'),
});
