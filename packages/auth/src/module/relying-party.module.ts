/**
 * Importing npm packages
 */
import { DynamicModule, Module } from '@shadow-library/app';
import { Config } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import './config';
import { RelyingParty, type RelyingPartyConfig } from '../rp/relying-party';

/**
 * Defining types
 */

/** The issuer falls back to the `AUTH_ISSUER` environment config when not passed in code */
export type RelyingPartyModuleOptions = Omit<RelyingPartyConfig, 'issuer'> & { issuer?: string };

/**
 * Declaring the constants
 *
 * **For third-party and external consumers only.** A Shadow app imports `AuthModule.forRoot()` and
 * gets first-party login end to end; importing this module instead reintroduces the token pair D-18
 * exists to remove. See `RelyingParty` for the full reasoning.
 */

@Module({})
export class RelyingPartyModule {
  static forRoot(options: RelyingPartyModuleOptions): DynamicModule {
    const relyingParty = new RelyingParty({ ...options, issuer: options.issuer ?? Config.get('auth.issuer') });
    return {
      module: RelyingPartyModule,
      providers: [{ token: RelyingParty, useValue: relyingParty }],
      exports: [RelyingParty],
    };
  }
}
