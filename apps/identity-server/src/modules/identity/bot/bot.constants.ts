import { type Application } from '@server/modules/infrastructure/datastore';

export interface BotRoleDefinition {
  name: string;
  description: string;
  resource: string;
  level: Application.BotGrantLevel;
  permissions: readonly BotPermission[];
}

export const BOT_ACCESS_TOKEN_TTL_SECONDS = 300;

export const BOT_PERMISSIONS = {
  membersRead: 'identity:org:members:read',
  membersWrite: 'identity:org:members:write',
  invitationsWrite: 'identity:org:invitations:write',
  domainsRead: 'identity:org:domains:read',
} as const;

export type BotPermission = (typeof BOT_PERMISSIONS)[keyof typeof BOT_PERMISSIONS];

export const BOT_PERMISSION_DESCRIPTIONS: Record<BotPermission, string> = {
  [BOT_PERMISSIONS.membersRead]: 'List the members of the organisation',
  [BOT_PERMISSIONS.membersWrite]: 'Suspend, block and reinstate members of the organisation',
  [BOT_PERMISSIONS.invitationsWrite]: 'List, send and revoke invitations to the organisation',
  [BOT_PERMISSIONS.domainsRead]: 'List the domains registered to the organisation',
};

export const IDENTITY_BOT_ROLES: readonly BotRoleDefinition[] = [
  {
    name: 'OrgMembersReader',
    description: 'Bot access to read the organisation member list',
    resource: 'members',
    level: 'read',
    permissions: [BOT_PERMISSIONS.membersRead],
  },
  {
    name: 'OrgMembersManager',
    description: 'Bot access to read members and change the status of non-admin members',
    resource: 'members',
    level: 'write',
    permissions: [BOT_PERMISSIONS.membersRead, BOT_PERMISSIONS.membersWrite],
  },
  {
    name: 'OrgInvitationsManager',
    description: 'Bot access to list, send and revoke organisation invitations',
    resource: 'invitations',
    level: 'write',
    permissions: [BOT_PERMISSIONS.invitationsWrite],
  },
  {
    name: 'OrgDomainsReader',
    description: 'Bot access to read the organisation domains',
    resource: 'domains',
    level: 'read',
    permissions: [BOT_PERMISSIONS.domainsRead],
  },
];

export const BOT_KEY_EXCHANGE_LIMIT_PER_MINUTE = 60;

export const BOT_AUDIT_ACTIONS = [
  'bot.created',
  'bot.updated',
  'bot.suspended',
  'bot.resumed',
  'bot.permissions.changed',
  'bot.key.created',
  'bot.key.revoked',
  'bot.key.expired',
  'bot.key.used',
  'bot.key.exchange_denied',
  'bot.deletion.requested',
  'bot.ownership.transferred',
  'bot.deleted',
] as const;

export type BotAuditAction = (typeof BOT_AUDIT_ACTIONS)[number];
