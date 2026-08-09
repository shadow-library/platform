import { Body, Delete, Get, HttpController, Params, Patch, Post, Put, RespondFor } from '@shadow-library/fastify';

import { Auth, Context } from '@server/modules/access';
import { IdentityProviderService, type SocialProviderKind } from '@server/modules/auth/federation';
import { AuditService } from '@server/modules/infrastructure/audit';
import { IdentityProvider } from '@server/modules/infrastructure/datastore';
import { AuthModeDescriptor, AuthModeService } from '@server/modules/system/auth-mode';

import { AdminActor } from './admin-access.service';
import {
  AuthModeItem,
  AuthModeListResponse,
  AuthModeParams,
  CreateGlobalIdentityProviderBody,
  GlobalIdentityProviderItem,
  GlobalIdentityProviderListResponse,
  IdentityProviderIdParams,
  SetAuthModeBody,
  UpdateGlobalIdentityProviderBody,
} from './admin-auth-mode.dto';
import { AdminActionResponse } from './admin-user.dto';
import { ADMIN_PERMISSIONS } from './admin.constants';

@HttpController('/api/v1/admin')
export class AdminAuthModeController {
  constructor(
    private readonly authModeService: AuthModeService,
    private readonly identityProviderService: IdentityProviderService,
    private readonly auditService: AuditService,
  ) {}

  private toProviderItem(provider: IdentityProvider): GlobalIdentityProviderItem {
    return {
      id: provider.id,
      kind: provider.kind as SocialProviderKind,
      name: provider.name,
      issuer: provider.issuer,
      clientId: provider.clientId,
      scopes: provider.scopes,
      allowSignUp: provider.allowSignUp,
      isActive: provider.isActive,
      createdAt: provider.createdAt.toISOString(),
    };
  }

  private toModeItem(mode: AuthModeDescriptor): AuthModeItem {
    const item: AuthModeItem = { method: mode.method, label: mode.label, description: mode.description, kind: mode.kind, enabled: mode.enabled, configured: mode.configured };
    if (mode.provider) item.provider = this.toProviderItem(mode.provider);
    return item;
  }

  private async record(actor: AdminActor, action: string, targetType: string, targetId: string): Promise<void> {
    await this.auditService.record({ action, outcome: 'SUCCESS', actorType: 'USER', actorId: actor.session.userId.toString(), targetType, targetId });
  }

  @Get('/auth-modes')
  @Auth({ permission: ADMIN_PERMISSIONS.clientsRead })
  @RespondFor(200, AuthModeListResponse)
  async listAuthModes(): Promise<AuthModeListResponse> {
    const modes = await this.authModeService.list();
    return { items: modes.map(mode => this.toModeItem(mode)) };
  }

  @Put('/auth-modes/:method')
  @Auth({ permission: ADMIN_PERMISSIONS.clientsManage, elevated: true })
  @RespondFor(200, AdminActionResponse)
  async setAuthMode(@Params() params: AuthModeParams, @Body() body: SetAuthModeBody): Promise<AdminActionResponse> {
    const actor = Context.getActor();
    await this.authModeService.setEnabled(params.method, body.enabled, actor.session.userId);
    await this.record(actor, body.enabled ? 'auth.mode.enabled' : 'auth.mode.disabled', 'auth_mode', params.method);
    return { success: true };
  }

  @Get('/identity-providers')
  @Auth({ permission: ADMIN_PERMISSIONS.clientsRead })
  @RespondFor(200, GlobalIdentityProviderListResponse)
  async listGlobalIdentityProviders(): Promise<GlobalIdentityProviderListResponse> {
    const providers = await this.identityProviderService.listGlobal();
    return { items: providers.map(provider => this.toProviderItem(provider)) };
  }

  @Post('/identity-providers')
  @Auth({ permission: ADMIN_PERMISSIONS.clientsManage, elevated: true })
  @RespondFor(201, GlobalIdentityProviderItem)
  async createGlobalIdentityProvider(@Body() body: CreateGlobalIdentityProviderBody): Promise<GlobalIdentityProviderItem> {
    const actor = Context.getActor();
    const provider = await this.identityProviderService.createGlobal(body);
    await this.authModeService.invalidate();
    await this.record(actor, 'auth.social_provider.configured', 'identity_provider', provider.id);
    return this.toProviderItem(provider);
  }

  @Patch('/identity-providers/:identityProviderId')
  @Auth({ permission: ADMIN_PERMISSIONS.clientsManage, elevated: true })
  @RespondFor(200, GlobalIdentityProviderItem)
  async updateGlobalIdentityProvider(@Params() params: IdentityProviderIdParams, @Body() body: UpdateGlobalIdentityProviderBody): Promise<GlobalIdentityProviderItem> {
    const actor = Context.getActor();
    const provider = await this.identityProviderService.updateGlobal(params.identityProviderId, body);
    await this.authModeService.invalidate();
    await this.record(actor, 'auth.social_provider.updated', 'identity_provider', provider.id);
    return this.toProviderItem(provider);
  }

  @Delete('/identity-providers/:identityProviderId')
  @Auth({ permission: ADMIN_PERMISSIONS.clientsManage, elevated: true })
  @RespondFor(200, AdminActionResponse)
  async deleteGlobalIdentityProvider(@Params() params: IdentityProviderIdParams): Promise<AdminActionResponse> {
    const actor = Context.getActor();
    await this.identityProviderService.removeGlobal(params.identityProviderId);
    await this.authModeService.invalidate();
    await this.record(actor, 'auth.social_provider.removed', 'identity_provider', params.identityProviderId);
    return { success: true };
  }
}
