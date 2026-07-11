/**
 * Importing npm packages
 */
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
import { UserModule } from '@server/modules/identity/user';
import { AuditModule } from '@server/modules/infrastructure/audit';
import { HealthModule } from '@server/modules/infrastructure/health';
import { NotificationModule } from '@server/modules/infrastructure/notification';
import { SecurityModule } from '@server/modules/infrastructure/security';

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

export const AppHttpCoreModule = HttpCoreModule.forRoot({});

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
    UserModule,
    AuditModule,
    NotificationModule,
    AdminModule,
  ],

  host: Config.get('server.host'),
  port: Config.get('server.port'),
});
