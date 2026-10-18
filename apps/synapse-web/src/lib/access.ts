import { type QueryClient, useQuery } from '@tanstack/react-query';

import { accessQueryOptions, isApiError } from './apis';

/** Mirrors synapse-server's `SYNAPSE_PERMISSIONS`; the server enforces each one whatever this console shows. */
export const SYNAPSE_PERMISSIONS = {
  catalogRead: 'synapse:catalog:read',
  catalogWrite: 'synapse:catalog:write',
  catalogPublish: 'synapse:catalog:publish',
  providersWrite: 'synapse:providers:write',
  credentialsManage: 'synapse:credentials:manage',
  budgetsWrite: 'synapse:budgets:write',
  usageRead: 'synapse:usage:read',
} as const;

const UNAUTHENTICATED = 401;

/** `unavailable` is a check that failed with no earlier answer to fall back on: neither a grant nor a denial. */
export type AccessStatus = 'pending' | 'unavailable' | 'known';

export interface AccessCheck {
  status: AccessStatus;
  retry: () => void;
  retrying: boolean;
}

export interface Capabilities {
  readCatalog: boolean;
  writeDraft: boolean;
  publish: boolean;
  writeProviders: boolean;
  manageCredentials: boolean;
  writeBudgets: boolean;
  readUsage: boolean;
}

export function capabilitiesOf(permissions: readonly string[]): Capabilities {
  const held = new Set(permissions);
  return {
    readCatalog: held.has(SYNAPSE_PERMISSIONS.catalogRead),
    writeDraft: held.has(SYNAPSE_PERMISSIONS.catalogWrite),
    publish: held.has(SYNAPSE_PERMISSIONS.catalogPublish),
    writeProviders: held.has(SYNAPSE_PERMISSIONS.providersWrite),
    manageCredentials: held.has(SYNAPSE_PERMISSIONS.credentialsManage),
    writeBudgets: held.has(SYNAPSE_PERMISSIONS.budgetsWrite),
    readUsage: held.has(SYNAPSE_PERMISSIONS.usageRead),
  };
}

export function accessStatusOf(access: { data?: unknown; isError: boolean }): AccessStatus {
  if (access.data !== undefined) return 'known';
  return access.isError ? 'unavailable' : 'pending';
}

/** An unanswered permission check hides every control rather than failing the page; only a lost session still throws. */
export async function loadCapabilities(queryClient: QueryClient): Promise<Capabilities> {
  const access = await queryClient.ensureQueryData(accessQueryOptions()).catch((error: unknown) => {
    if (isApiError(error) && error.status === UNAUTHENTICATED) throw error;
    return null;
  });
  return capabilitiesOf(access?.permissions ?? []);
}

export function useAccessCheck(): AccessCheck {
  const access = useQuery(accessQueryOptions());
  return { status: accessStatusOf(access), retry: () => void access.refetch(), retrying: access.isFetching };
}

/** Holds nothing until the shell's gate has loaded the answer, so a control is never offered on a guess. */
export function useCapabilities(): Capabilities {
  const { data } = useQuery(accessQueryOptions());
  return capabilitiesOf(data?.permissions ?? []);
}
