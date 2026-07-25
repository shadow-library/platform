/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { forwardRef, type Import, Module } from '@shadow-library/app';
import { AuthModule } from '@shadow-library/auth/module';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * `AuthModule.forRoot()` is the whole first-party integration. With `basePath: '/api/auth'` the SDK
 * mounts the browser surface itself — `GET /login`, `GET /callback`, `POST /logout`, `GET /session`,
 * `GET /step-up` — manages the opaque app-session cookie, and registers the bearer/cookie
 * `AuthGuard`. Audience, redirect URIs and granted scopes are discovered from identity's
 * `GET /api/v1/apps/me` (D-21), so nothing about the registration is restated here; the deploy
 * supplies only `AUTH_ISSUER`, `AUTH_APP_ID` and a client credential.
 */

// forwardRef because @Module deep-freezes its metadata object; the wrapper keeps the pre-built
// dynamic module (and the live AuthClient inside it) out of the frozen graph. The cast is required
// only because `Import` types ForwardReference around classes, while the registry resolves any
// `forwardRef()` result — dynamic modules included.
const IdentityAuthModule = AuthModule.forRoot({ routes: { basePath: '/api/auth' } });

@Module({
  imports: [forwardRef(() => IdentityAuthModule) as unknown as Import],
})
export class AppAuthModule {}
