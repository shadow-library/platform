/**
 * Importing npm packages
 */
import { type FastifyRequest } from 'fastify';
import { Body, Delete, Get, HttpController, HttpStatus, Params, Post, Req, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { SessionAuthService, ValidatedSession } from '@server/modules/auth/session';
import { AuditService } from '@server/modules/infrastructure/audit';
import { Organisation } from '@server/modules/infrastructure/datastore';

import { DomainChallenge, DomainService } from './domain.service';
import { DomainItem, DomainParams, DomainsResponse, OrganisationActionResponse, OrganisationIdParams, RegisterDomainBody } from './organisation.dto';
import { OrganisationService } from './organisation.service';

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
  constructor(
    private readonly sessionAuthService: SessionAuthService,
    private readonly organisationService: OrganisationService,
    private readonly domainService: DomainService,
    private readonly auditService: AuditService,
  ) {}

  private toItem(challenge: DomainChallenge): DomainItem {
    const { domain } = challenge;
    return {
      id: domain.id.toString(),
      domain: domain.domain,
      status: domain.status,
      txtRecordName: challenge.txtRecordName,
      txtRecordValue: challenge.txtRecordValue,
      verifiedAt: domain.verifiedAt?.toISOString(),
      lastCheckedAt: domain.lastCheckedAt?.toISOString(),
      lastCheckError: domain.lastCheckError ?? undefined,
    };
  }

  private async audit(request: FastifyRequest, session: ValidatedSession, organisationId: string, action: string, domain: Organisation.Domain): Promise<void> {
    await this.auditService.record({
      action,
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: session.userId.toString(),
      organisationId,
      targetType: 'organisation_domain',
      targetId: domain.id.toString(),
      detail: { domain: domain.domain },
      ipAddress: request.ip,
    });
  }

  @Get()
  @RespondFor(200, DomainsResponse)
  async list(@Params() params: OrganisationIdParams, @Req() request: FastifyRequest): Promise<DomainsResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    const organisationId = BigInt(params.organisationId);
    await this.organisationService.assertMember(session.userId, organisationId);
    const domains = await this.domainService.list(organisationId);
    return { domains: domains.map(domain => this.toItem(this.domainService.challengeOf(domain))) };
  }

  @Post()
  @RespondFor(201, DomainItem)
  async register(@Params() params: OrganisationIdParams, @Body() body: RegisterDomainBody, @Req() request: FastifyRequest): Promise<DomainItem> {
    const session = await this.sessionAuthService.authenticateElevated(request);
    const organisationId = BigInt(params.organisationId);
    await this.organisationService.requireRole(session.userId, organisationId, 'ADMIN');
    const challenge = await this.domainService.register(organisationId, body.domain);
    await this.audit(request, session, params.organisationId, 'org.domain_registered', challenge.domain);
    return this.toItem(challenge);
  }

  @Post('/:domainId/verify')
  @HttpStatus(200)
  @RespondFor(200, DomainItem)
  async verify(@Params() params: DomainParams, @Req() request: FastifyRequest): Promise<DomainItem> {
    const session = await this.sessionAuthService.authenticateElevated(request);
    const organisationId = BigInt(params.organisationId);
    await this.organisationService.requireRole(session.userId, organisationId, 'ADMIN');
    const domain = await this.domainService.verify(organisationId, BigInt(params.domainId));
    const action = domain.status === 'VERIFIED' ? 'org.domain_verified' : 'org.domain_verification_failed';
    await this.audit(request, session, params.organisationId, action, domain);
    return this.toItem(this.domainService.challengeOf(domain));
  }

  @Delete('/:domainId')
  @RespondFor(200, OrganisationActionResponse)
  async remove(@Params() params: DomainParams, @Req() request: FastifyRequest): Promise<OrganisationActionResponse> {
    const session = await this.sessionAuthService.authenticateElevated(request);
    const organisationId = BigInt(params.organisationId);
    await this.organisationService.requireRole(session.userId, organisationId, 'ADMIN');
    const domain = await this.domainService.remove(organisationId, BigInt(params.domainId));
    await this.audit(request, session, params.organisationId, 'org.domain_removed', domain);
    return { success: true };
  }
}
