/**
 * Importing npm packages
 */
import { type FastifyRequest } from 'fastify';
import { Body, Delete, Get, HttpController, Params, Patch, Post, Req, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { SessionAuthService, ValidatedSession } from '@server/modules/auth/session';
import { OrganisationService } from '@server/modules/identity/organisation';
import { AuditService } from '@server/modules/infrastructure/audit';
import { IdentityProvider } from '@server/modules/infrastructure/datastore';

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
export class IdentityProviderController {
  constructor(
    private readonly sessionAuthService: SessionAuthService,
    private readonly organisationService: OrganisationService,
    private readonly identityProviderService: IdentityProviderService,
    private readonly auditService: AuditService,
  ) {}

  private toResponse(provider: IdentityProvider): IdentityProviderResponse {
    return {
      id: provider.id,
      name: provider.name,
      issuer: provider.issuer,
      clientId: provider.clientId,
      scopes: provider.scopes,
      enforced: provider.enforced,
      isActive: provider.isActive,
      createdAt: provider.createdAt.toISOString(),
    };
  }

  private async requireAdmin(request: FastifyRequest, organisationId: bigint): Promise<ValidatedSession> {
    const session = await this.sessionAuthService.authenticateElevated(request);
    await this.organisationService.requireRole(session.userId, organisationId, 'ADMIN');
    return session;
  }

  private async audit(session: ValidatedSession, organisationId: bigint, action: string, targetId: string): Promise<void> {
    await this.auditService.record({
      action,
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: session.userId.toString(),
      organisationId: organisationId.toString(),
      targetType: 'identity_provider',
      targetId,
    });
  }

  @Get()
  @RespondFor(200, IdentityProviderListResponse)
  async list(@Params() params: OrganisationIdOnlyParams, @Req() request: FastifyRequest): Promise<IdentityProviderListResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    const organisationId = BigInt(params.organisationId);
    await this.organisationService.requireRole(session.userId, organisationId, 'ADMIN');
    const provider = await this.identityProviderService.getForOrganisation(organisationId);
    return { items: provider ? [this.toResponse(provider)] : [] };
  }

  @Post()
  @RespondFor(201, IdentityProviderResponse)
  async create(@Params() params: OrganisationIdOnlyParams, @Body() body: CreateIdentityProviderBody, @Req() request: FastifyRequest): Promise<IdentityProviderResponse> {
    const organisationId = BigInt(params.organisationId);
    const session = await this.requireAdmin(request, organisationId);
    const provider = await this.identityProviderService.create(organisationId, body);
    await this.audit(session, organisationId, 'org.idp.configured', provider.id);
    return this.toResponse(provider);
  }

  @Patch('/:identityProviderId')
  @RespondFor(200, IdentityProviderResponse)
  async update(@Params() params: IdentityProviderParams, @Body() body: UpdateIdentityProviderBody, @Req() request: FastifyRequest): Promise<IdentityProviderResponse> {
    const organisationId = BigInt(params.organisationId);
    const session = await this.requireAdmin(request, organisationId);
    const provider = await this.identityProviderService.update(organisationId, params.identityProviderId, body);
    await this.audit(session, organisationId, 'org.idp.updated', provider.id);
    return this.toResponse(provider);
  }

  @Delete('/:identityProviderId')
  async remove(@Params() params: IdentityProviderParams, @Req() request: FastifyRequest): Promise<{ success: boolean }> {
    const organisationId = BigInt(params.organisationId);
    const session = await this.requireAdmin(request, organisationId);
    await this.identityProviderService.remove(organisationId, params.identityProviderId);
    await this.audit(session, organisationId, 'org.idp.removed', params.identityProviderId);
    return { success: true };
  }
}
