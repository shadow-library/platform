/**
 * Importing npm packages
 */
import { Body, Delete, Get, HttpController, Params, Put, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { Auth, Context } from '@server/modules/access';
import { AuditService } from '@server/modules/infrastructure/audit';

import { OrganisationPolicyParams, PolicyActionResponse, PolicyItem, PolicyKeyParams, PolicyListResponse, SetPolicyBody } from './policy.dto';
import { PolicyKey } from './policy.registry';
import { PolicyService } from './policy.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/api/v1/organisations/:organisationId/policies')
export class PolicyController {
  constructor(
    private readonly policyService: PolicyService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @Auth({ orgRole: 'ADMIN' })
  @RespondFor(200, PolicyListResponse)
  async listPolicies(@Params() params: OrganisationPolicyParams): Promise<{ policies: PolicyItem[] }> {
    const policies = await this.policyService.listForOrganisation(params.organisationId);
    return {
      policies: policies.map(policy => ({
        key: policy.key,
        description: policy.description,
        type: policy.type,
        defaultValue: Number(policy.defaultValue),
        min: policy.min,
        max: policy.max,
        effectiveValue: Number(policy.effectiveValue),
        configuredValue: policy.configuredValue === null ? undefined : Number(policy.configuredValue),
      })),
    };
  }

  /** Tightening a security policy is itself a security-sensitive act, so both writes are audited. */
  @Put('/:policyKey')
  @Auth({ orgRole: 'ADMIN', elevated: true })
  @RespondFor(200, PolicyActionResponse)
  async setPolicy(@Params() params: PolicyKeyParams, @Body() body: SetPolicyBody): Promise<PolicyActionResponse> {
    const actorId = Context.getSession().userId;
    await this.policyService.set(params.organisationId, params.policyKey as PolicyKey, body.value, actorId);
    await this.recordChange(params, 'organisation.policy.updated', actorId, body.value);
    return { success: true };
  }

  @Delete('/:policyKey')
  @Auth({ orgRole: 'ADMIN', elevated: true })
  @RespondFor(200, PolicyActionResponse)
  async clearPolicy(@Params() params: PolicyKeyParams): Promise<PolicyActionResponse> {
    const actorId = Context.getSession().userId;
    await this.policyService.clear(params.organisationId, params.policyKey as PolicyKey);
    await this.recordChange(params, 'organisation.policy.cleared', actorId);
    return { success: true };
  }

  private async recordChange(params: PolicyKeyParams, action: string, actorId: bigint, value?: number): Promise<void> {
    await this.auditService.record({
      action,
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: actorId.toString(),
      organisationId: params.organisationId.toString(),
      targetType: 'organisation_policy',
      targetId: params.policyKey,
      detail: value === undefined ? undefined : { value },
    });
  }
}
