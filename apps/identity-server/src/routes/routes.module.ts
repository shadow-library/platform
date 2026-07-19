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
import { SamlModule } from '@server/modules/auth/saml';
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
import { ScimModule } from '@server/modules/scim';

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
    /** The browser UI is a separate app; this service serves only JSON, so nothing inline is needed. */
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'"],
        objectSrc: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
        manifestSrc: ["'self'"],
      },
    },
  },
  /**
   * OpenAPI is generated from the class-schema DTOs and served (non-prod) at
   * `/dev/api-docs/openapi.json`. `identity-web` consumes it via `bun run generate:api-types`,
   * so the client's request/response types stay in lockstep with the controllers.
   */
  openapi: { normalizeSchemaIds: true },
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
    SamlModule,
    AuthzModule,
    AuthFlowModule,
    MfaModule,
    ContactModule,
    OrganisationModule,
    UserModule,
    AuditModule,
    NotificationModule,
    AdminModule,
    ScimModule,
  ],

  /** The browser UI is a separate app (identity-web); this service exposes only the JSON/OAuth API. */
  fastifyFactory: async instance => {
    /** SCIM clients send RFC 7644's dedicated media type; the payload is ordinary JSON. */
    instance.addContentTypeParser('application/scim+json', { parseAs: 'string' }, (_request, body, done) => {
      try {
        done(null, typeof body === 'string' && body.length > 0 ? JSON.parse(body) : {});
      } catch (error) {
        done(error as Error);
      }
    });
    return instance;
  },

  host: Config.get('server.host'),
  port: Config.get('server.port'),
});
