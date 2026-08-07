import { Body, Delete, Get, HttpController, HttpStatus, Params, Post, Query, RespondFor } from '@shadow-library/fastify';

import { AppErrorCode } from '@server/classes';
import { Auth, Context } from '@server/modules/access';
import { AuditService } from '@server/modules/infrastructure/audit';
import { GroupMappingRow, ScimGroupMappingService } from '@server/modules/scim';
import { ApplicationRoleService } from '@server/modules/system/application';

import { AdminAccessService, AdminActor } from './admin-access.service';
import { CreateGroupMappingBody, GroupMappingIdParams, GroupMappingItem, GroupMappingListQuery, GroupMappingListResponse } from './admin-scim-mapping.dto';
import { AdminActionResponse } from './admin-user.dto';
import { ADMIN_PERMISSIONS } from './admin.constants';

/** Mutations authorize against the role's application so an app-scoped admin cannot map another application's roles. */

@HttpController('/api/v1/admin/scim/group-mappings')
export class AdminScimMappingController {
  constructor(
    private readonly access: AdminAccessService,
    private readonly mappingService: ScimGroupMappingService,
    private readonly applicationRoleService: ApplicationRoleService,
    private readonly auditService: AuditService,
  ) {}

  private toItem(row: GroupMappingRow): GroupMappingItem {
    return {
      id: row.id,
      groupId: row.groupId,
      roleId: row.roleId,
      organisationId: row.organisationId.toString(),
      createdBy: row.createdBy ?? undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async record(actor: AdminActor, action: string, mappingId: string, detail: Record<string, unknown>): Promise<void> {
    await this.auditService.record({
      action,
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: actor.session.userId.toString(),
      targetType: 'scim_group_mapping',
      targetId: mappingId,
      detail,
    });
  }

  @Get()
  @Auth({ permission: ADMIN_PERMISSIONS.rolesManage })
  @RespondFor(200, GroupMappingListResponse)
  async listMappings(@Query() query: GroupMappingListQuery): Promise<GroupMappingListResponse> {
    const rows = await this.mappingService.listMappings({
      organisationId: query.organisationId !== undefined ? BigInt(query.organisationId) : undefined,
      groupId: query.groupId,
    });
    return { items: rows.map(row => this.toItem(row)) };
  }

  @Post()
  @Auth({ elevated: true })
  @HttpStatus(201)
  @RespondFor(201, GroupMappingItem)
  async createMapping(@Body() body: CreateGroupMappingBody): Promise<GroupMappingItem> {
    const role = await this.applicationRoleService.getRole(body.roleId);
    if (!role) throw AppErrorCode.APP_003.create();
    const actor = await this.access.requireRoleAdmin(Context.getSession(), role.applicationId);
    const mapping = await this.mappingService.createMapping(role, body.groupId, actor.session.userId.toString());
    await this.record(actor, 'scim.group_mapping.created', mapping.id, { groupId: mapping.groupId, roleId: mapping.roleId, organisationId: mapping.organisationId.toString() });
    return this.toItem(mapping);
  }

  @Delete('/:mappingId')
  @Auth({ elevated: true })
  @HttpStatus(200)
  @RespondFor(200, AdminActionResponse)
  async deleteMapping(@Params() params: GroupMappingIdParams): Promise<AdminActionResponse> {
    const mapping = await this.mappingService.getMapping(params.mappingId);
    if (!mapping) throw AppErrorCode.SCIM_002.create();
    const role = await this.applicationRoleService.getRole(mapping.roleId);
    if (!role) throw AppErrorCode.APP_003.create();
    const actor = await this.access.requireRoleAdmin(Context.getSession(), role.applicationId);
    await this.mappingService.deleteMapping(mapping);
    await this.record(actor, 'scim.group_mapping.deleted', mapping.id, { groupId: mapping.groupId, roleId: mapping.roleId });
    return { success: true };
  }
}
