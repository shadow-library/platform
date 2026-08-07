export const PLATFORM_ORG_NAME = 'Shadow Platform';
export const IAM_ADMIN_ROLE = 'IAMAdmin';

/** Platform permissions checked through ordinary RBAC in the platform organisation. */
export const ADMIN_PERMISSIONS = {
  usersRead: 'iam:users:read',
  usersManage: 'iam:users:manage',
  appsRead: 'iam:apps:read',
  appsManage: 'iam:apps:manage',
  clientsRead: 'iam:clients:read',
  clientsManage: 'iam:clients:manage',
  rolesManage: 'iam:roles:manage',
  auditRead: 'iam:audit:read',
  webhooksManage: 'iam:webhooks:manage',
  appRolesManage: 'app:roles:manage',
} as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[keyof typeof ADMIN_PERMISSIONS];
