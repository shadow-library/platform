import { Config } from '@shadow-library/common';
import { FastifyModule } from '@shadow-library/fastify';
import { HttpCoreModule } from '@shadow-library/modules';

import { AccessModule } from '@server/modules/access/access.module';
import { AdminModule } from '@server/modules/admin';
import { AppSessionModule } from '@server/modules/auth/app-session';
import { AuthFlowModule } from '@server/modules/auth/flow';
import { KeyModule } from '@server/modules/auth/keys';
import { MfaModule } from '@server/modules/auth/mfa';
import { OAuthModule } from '@server/modules/auth/oauth';
import { SamlModule } from '@server/modules/auth/saml';
import { SessionModule } from '@server/modules/auth/session';
import { TokenModule } from '@server/modules/auth/token';
import { AuthzModule } from '@server/modules/authz';
import { AccountCloseModule } from '@server/modules/identity/account';
import { ContactModule } from '@server/modules/identity/contact';
import { DirectoryModule } from '@server/modules/identity/directory';
import { OrganisationModule } from '@server/modules/identity/organisation';
import { OrgOAuthAppModule } from '@server/modules/identity/organisation/org-oauth-app.module';
import { UserModule } from '@server/modules/identity/user';
import { AuditModule } from '@server/modules/infrastructure/audit';
import { HealthModule } from '@server/modules/infrastructure/health';
import { NotificationModule } from '@server/modules/infrastructure/notification';
import { SecurityModule } from '@server/modules/infrastructure/security';
import { ScimModule } from '@server/modules/scim';
import { PolicyModule } from '@server/modules/system/policy';

export const AppHttpCoreModule = HttpCoreModule.forRoot({
  helmet: {
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
    AppSessionModule,
    SamlModule,
    AuthzModule,
    AuthFlowModule,
    MfaModule,
    ContactModule,
    OrganisationModule,
    OrgOAuthAppModule,
    DirectoryModule,
    UserModule,
    AuditModule,
    NotificationModule,
    AdminModule,
    AccountCloseModule,
    ScimModule,
    PolicyModule,
    AccessModule,
  ],

  fastifyFactory: async instance => {
    instance.addContentTypeParser('application/scim+json', { parseAs: 'string' }, (_request, body, done) => {
      try {
        done(null, typeof body === 'string' && body.length > 0 ? JSON.parse(body) : {});
      } catch (error) {
        done(error as Error);
      }
    });

    instance.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => {
      try {
        done(null, Object.fromEntries(new URLSearchParams(typeof body === 'string' ? body : '')));
      } catch (error) {
        done(error as Error);
      }
    });
    return instance;
  },

  host: Config.get('server.host'),
  port: Config.get('server.port'),
});
