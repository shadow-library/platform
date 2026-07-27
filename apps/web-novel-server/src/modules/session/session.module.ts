/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { type DynamicModule, forwardRef, type Import, Module } from '@shadow-library/app';
import { RelyingPartyModule } from '@shadow-library/auth/module';
import { Config } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { SessionController } from './session.controller';
import { SessionService } from './session.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The relying-party client is this app's identity-side OAuth registration for the reader web
 * login. The issuer falls back to `AUTH_ISSUER`, shared with the publish guard's `AuthModule`.
 */

let relyingPartyModule: DynamicModule | undefined;

/**
 * forwardRef defers construction past `@Module`'s metadata deep-freeze: the dynamic module holds
 * a live `RelyingParty` in a value provider, which must stay mutable (discovery/JWKS caches).
 */
const SessionRelyingPartyModule = forwardRef(
  () =>
    (relyingPartyModule ??= RelyingPartyModule.forRoot({
      client: { id: Config.get('session.client-id'), secret: Config.get('session.client-secret') },
      redirectUri: Config.get('session.redirect-uri'),
      scopes: ['openid', 'email', 'profile'],
    })),
) as unknown as Import;

@Module({
  imports: [SessionRelyingPartyModule],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
