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
