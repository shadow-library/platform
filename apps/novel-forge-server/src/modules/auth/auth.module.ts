/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { type Import, Module, forwardRef } from '@shadow-library/app';
import { AuthModule, RelyingPartyModule } from '@shadow-library/auth/module';
import { Config } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AuthController } from './auth.controller';
import { SessionCookieMiddleware } from './session-cookie.middleware';
import { SessionService } from './session.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * `AuthModule.forRoot()` resolves the identity issuer/audience (and optional service-account
 * client) from the `AUTH_*` environment configs and registers the route `AuthGuard`; the relying
 * party drives the browser OIDC code flow for the first-party session surface. Both are created
 * once here and shared through `AppAuthModule`.
 */

const IdentityAuthModule = AuthModule.forRoot();

const IdentityRelyingPartyModule = RelyingPartyModule.forRoot({
  client: { id: Config.get('auth.rp.client.id'), secret: Config.get('auth.rp.client.secret') || undefined },
  redirectUri: Config.get('auth.redirect-uri'),
});

// The dynamic modules go through forwardRef because @Module deep-freezes its metadata object; the
// wrapper keeps the pre-built module (and the live AuthClient inside it) out of the frozen graph.
// The cast is required only because `Import` types ForwardReference around classes, while the
// registry resolves any `forwardRef()` result — dynamic modules included.
@Module({
  imports: [forwardRef(() => IdentityAuthModule) as unknown as Import, forwardRef(() => IdentityRelyingPartyModule) as unknown as Import],
  controllers: [AuthController, SessionCookieMiddleware],
  providers: [SessionService],
})
export class AppAuthModule {}
