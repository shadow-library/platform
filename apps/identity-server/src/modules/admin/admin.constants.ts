/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Platform administration is modelled as ordinary RBAC (T-601): admin permissions live on the
 * platform application and are checked in the platform organisation, so the PDP — not bespoke
 * flags — decides who may operate the IdP. `app:roles:manage` is the application-scoped tier: it
 * grants role administration only for the application that owns the caller's role, never platform
 * wide.
 */

export const PLATFORM_ORG_NAME = 'Shadow Platform';
export const IAM_ADMIN_ROLE = 'IAMAdmin';

export const ADMIN_PERMISSIONS = {
  usersRead: 'iam:users:read',
  usersManage: 'iam:users:manage',
  clientsRead: 'iam:clients:read',
  clientsManage: 'iam:clients:manage',
  rolesManage: 'iam:roles:manage',
  auditRead: 'iam:audit:read',
  appRolesManage: 'app:roles:manage',
} as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[keyof typeof ADMIN_PERMISSIONS];
