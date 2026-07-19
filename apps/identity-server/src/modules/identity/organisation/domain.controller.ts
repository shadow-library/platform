/**
 * Importing npm packages
 */
import { Body, Delete, Get, HttpController, HttpStatus, Params, Post, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { Auth, Context } from '@server/modules/access';

import { type DomainDetail, DomainService } from './domain.service';
import { DomainItem, DomainParams, DomainsResponse, OrganisationActionResponse, OrganisationIdParams, RegisterDomainBody } from './organisation.dto';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Domain verification hands out tenant-wide capabilities later (SAML, SCIM, JIT provisioning), so
 * every domain mutation demands an elevated org admin (AAL2); members may read. Verification never
 * auto-captures users by email domain — that policy belongs to inbound federation (T-702).
 */

@HttpController('/api/v1/organisations/:organisationId/domains')
export class DomainController {
  constructor(private readonly domainService: DomainService) {}

  private caller() {
    return { session: Context.getSession(), ip: Context.getClientInfo().ip };
  }

  @Get()
  @Auth({ orgMember: true })
  @RespondFor(200, DomainsResponse)
  async listDomains(@Params() params: OrganisationIdParams): Promise<{ domains: DomainDetail[] }> {
    return { domains: await this.domainService.listDomainItems(params.organisationId) };
  }

  @Post()
  @Auth({ orgRole: 'ADMIN', elevated: true })
  @HttpStatus(201)
  @RespondFor(201, DomainItem)
  registerDomain(@Params() params: OrganisationIdParams, @Body() body: RegisterDomainBody): Promise<DomainDetail> {
    return this.domainService.registerDomain(this.caller(), params.organisationId, body.domain);
  }

  @Post('/:domainId/verify')
  @Auth({ orgRole: 'ADMIN', elevated: true })
  @HttpStatus(200)
  @RespondFor(200, DomainItem)
  verifyDomain(@Params() params: DomainParams): Promise<DomainDetail> {
    return this.domainService.verifyDomain(this.caller(), params.organisationId, params.domainId);
  }

  @Delete('/:domainId')
  @Auth({ orgRole: 'ADMIN', elevated: true })
  @RespondFor(200, OrganisationActionResponse)
  async removeDomain(@Params() params: DomainParams): Promise<OrganisationActionResponse> {
    await this.domainService.removeDomain(this.caller(), params.organisationId, params.domainId);
    return { success: true };
  }
}
