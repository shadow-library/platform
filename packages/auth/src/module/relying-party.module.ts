import { DynamicModule, Module } from '@shadow-library/app';
import { Config } from '@shadow-library/common';

import './config';
import { RelyingParty, type RelyingPartyConfig } from '../rp/relying-party';

/** The issuer falls back to the `AUTH_ISSUER` environment config when not passed in code */
export type RelyingPartyModuleOptions = Omit<RelyingPartyConfig, 'issuer'> & { issuer?: string };

/**
 * For third-party and external consumers only: a Shadow app uses `AuthModule.forRoot()`, and this module reintroduces the access/refresh token pair that first-party app
 * sessions exist to avoid
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
