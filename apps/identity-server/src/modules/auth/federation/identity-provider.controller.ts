/**
 * Importing npm packages
 */
import { Body, Delete, Get, HttpController, Params, Patch, Post, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { Auth, Context } from '@server/modules/access';
import { type IdentityProvider } from '@server/modules/infrastructure/datastore';

import {
  CreateIdentityProviderBody,
  IdentityProviderListResponse,
  IdentityProviderParams,
  IdentityProviderResponse,
  OrganisationIdOnlyParams,
  UpdateIdentityProviderBody,
} from './federation.dto';
import { IdentityProviderService } from './identity-provider.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Identity provider configuration follows the verified-domain authorization split (T-703): every
 * mutation needs an org ADMIN with AAL2 step-up — pointing sign-in at a different issuer is
 * account takeover at organisation scale, so it demands the same ceremony as domain changes.
 */

@HttpController('/api/v1/organisations/:organisationId/identity-providers')
@Auth({ orgRole: 'ADMIN' })
export class IdentityProviderController {
  constructor(private readonly identityProviderService: IdentityProviderService) {}

  @Get()
  @RespondFor(200, IdentityProviderListResponse)
  async listIdentityProviders(@Params() params: OrganisationIdOnlyParams): Promise<{ items: IdentityProvider[] }> {
    const provider = await this.identityProviderService.getForOrganisation(params.organisationId);
    return { items: provider ? [provider] : [] };
  }

  @Post()
  @Auth({ elevated: true })
  @RespondFor(201, IdentityProviderResponse)
  createIdentityProvider(@Params() params: OrganisationIdOnlyParams, @Body() body: CreateIdentityProviderBody): Promise<IdentityProvider> {
    return this.identityProviderService.registerIdentityProvider(Context.getSession(), params.organisationId, body);
  }

  @Patch('/:identityProviderId')
  @Auth({ elevated: true })
  @RespondFor(200, IdentityProviderResponse)
  updateIdentityProvider(@Params() params: IdentityProviderParams, @Body() body: UpdateIdentityProviderBody): Promise<IdentityProvider> {
    return this.identityProviderService.updateIdentityProviderConfig(Context.getSession(), params.organisationId, params.identityProviderId, body);
  }

  @Delete('/:identityProviderId')
  @Auth({ elevated: true })
  async removeIdentityProvider(@Params() params: IdentityProviderParams): Promise<{ success: boolean }> {
    await this.identityProviderService.removeIdentityProviderConfig(Context.getSession(), params.organisationId, params.identityProviderId);
    return { success: true };
  }
}
