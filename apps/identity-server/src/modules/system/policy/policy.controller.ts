import { Body, Delete, Get, HttpController, Params, Put, RespondFor } from '@shadow-library/fastify';

import { Auth, Context } from '@server/modules/access';
import { AuditService } from '@server/modules/infrastructure/audit';

import { OrganisationPolicyParams, PolicyActionResponse, PolicyItem, PolicyKeyParams, PolicyListResponse, SetPolicyBody } from './policy.dto';
import { PolicyKey } from './policy.registry';
import { PolicyDescriptor, PolicyService } from './policy.service';

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
    return { policies: policies.map(policy => PolicyController.toItem(policy)) };
  }

  private static toItem(policy: PolicyDescriptor): PolicyItem {
    const item: PolicyItem = { key: policy.key, label: policy.label, description: policy.description, type: policy.type };
    if (policy.type === 'boolean') {
      item.defaultEnabled = Boolean(policy.defaultValue);
      item.effectiveEnabled = Boolean(policy.effectiveValue);
      if (policy.configuredValue !== null) item.configuredEnabled = Boolean(policy.configuredValue);
      return item;
    }

    item.defaultValue = Number(policy.defaultValue);
    item.min = policy.min;
    item.max = policy.max;
    item.effectiveValue = Number(policy.effectiveValue);
    if (policy.configuredValue !== null) item.configuredValue = Number(policy.configuredValue);
    return item;
  }

  @Put('/:policyKey')
  @Auth({ orgRole: 'ADMIN', elevated: true })
  @RespondFor(200, PolicyActionResponse)
  async setPolicy(@Params() params: PolicyKeyParams, @Body() body: SetPolicyBody): Promise<PolicyActionResponse> {
    const actorId = Context.getSession().userId;
    const key = params.policyKey as PolicyKey;
    const value = this.policyService.selectValue(key, body);
    await this.policyService.set(params.organisationId, key, value, actorId);
    await this.recordChange(params, 'organisation.policy.updated', actorId, value);
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

  private async recordChange(params: PolicyKeyParams, action: string, actorId: bigint, value?: number | boolean): Promise<void> {
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
