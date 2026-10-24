/** Identity's bootstrap seeds the same permissions and roles; the two lists must be edited together. */
export const SYNAPSE_PERMISSIONS = {
  catalogRead: 'synapse:catalog:read',
  catalogWrite: 'synapse:catalog:write',
  catalogPublish: 'synapse:catalog:publish',
  providersWrite: 'synapse:providers:write',
  budgetsWrite: 'synapse:budgets:write',
  usageRead: 'synapse:usage:read',
  credentialsManage: 'synapse:credentials:manage',
} as const;

/** Granted to calling services on `api://synapse`; never held by a user. */
export const SYNAPSE_SCOPES = {
  infer: 'synapse:infer',
  catalogRead: 'synapse:catalog:read',
} as const;

const VIEWER_PERMISSIONS = [SYNAPSE_PERMISSIONS.catalogRead, SYNAPSE_PERMISSIONS.usageRead] as const;
const OPERATOR_PERMISSIONS = [...VIEWER_PERMISSIONS, SYNAPSE_PERMISSIONS.catalogWrite] as const;
const FINANCE_PERMISSIONS = [...VIEWER_PERMISSIONS, SYNAPSE_PERMISSIONS.budgetsWrite] as const;
const ADMIN_PERMISSIONS = [...OPERATOR_PERMISSIONS, SYNAPSE_PERMISSIONS.catalogPublish, SYNAPSE_PERMISSIONS.providersWrite, SYNAPSE_PERMISSIONS.budgetsWrite] as const;

export const SYNAPSE_ROLES = {
  viewer: { name: 'SynapseViewer', permissions: VIEWER_PERMISSIONS },
  operator: { name: 'SynapseOperator', permissions: OPERATOR_PERMISSIONS },
  finance: { name: 'SynapseFinance', permissions: FINANCE_PERMISSIONS },
  admin: { name: 'SynapseAdmin', permissions: ADMIN_PERMISSIONS, grantToBootstrapAdmin: true },
  /** Kept apart from the catalog roles: whoever holds both can point a key at any origin, so only owners should */
  credentialsAdmin: { name: 'SynapseCredentialsAdmin', permissions: [SYNAPSE_PERMISSIONS.credentialsManage], grantToBootstrapAdmin: true },
} as const;
