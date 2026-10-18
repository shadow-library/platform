import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useState } from 'react';

import { type AuthApi, type AuthOrganisation } from '../auth';
import { ApiError, isApiError } from '../lib/api-error';

export type OrganisationSwitchApi = Pick<AuthApi, 'organisationsQueryOptions' | 'switchOrganisation'>;

/** The props `@shadow-library/ui`'s `OrganisationSwitcher` takes, so the hook's `switcher` spreads straight onto it. */
export interface OrganisationSwitcherBinding {
  organisations: AuthOrganisation[];
  activeId?: string;
  switching: boolean;
  /** Ignores the active organisation. */
  onSwitch: (organisationId: string) => void;
}

export interface OrganisationSwitch {
  switcher: OrganisationSwitcherBinding;
  /** The last switch's failure, held until the next attempt or `dismissError`; the session and the cache are as they were before it. */
  error: ApiError | null;
  dismissError: () => void;
}

export interface OrganisationSwitchSteps {
  switchOrganisation: AuthApi['switchOrganisation'];
  queryClient: Pick<QueryClient, 'clear'>;
  reload: () => Promise<void>;
}

const SWITCH_FAILED = { code: 'ORGANISATION_SWITCH_FAILED', type: 'ClientError', message: 'The organisation could not be switched' } as const;

/**
 * Every cached response, the permissions included, was answered for the previous organisation, so the cache is dropped whole
 * rather than selectively invalidated: a stale list rendered against new permissions is exactly the confusion this avoids.
 */
export async function switchOrganisationAndReload(organisationId: string, steps: OrganisationSwitchSteps): Promise<ApiError | null> {
  try {
    await steps.switchOrganisation(organisationId);
  } catch (error: unknown) {
    return isApiError(error) ? error : new ApiError(-1, SWITCH_FAILED);
  }
  steps.queryClient.clear();
  await steps.reload();
  return null;
}

export function useOrganisationSwitch(api: OrganisationSwitchApi): OrganisationSwitch {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const { data: organisations = [] } = useQuery(api.organisationsQueryOptions());
  const activeId = organisations.find(organisation => organisation.active)?.id;

  const switchTo = async (organisationId: string): Promise<void> => {
    if (organisationId === activeId) return;
    setError(null);
    setSwitching(true);
    try {
      setError(await switchOrganisationAndReload(organisationId, { switchOrganisation: api.switchOrganisation, queryClient, reload: () => router.invalidate() }));
    } finally {
      setSwitching(false);
    }
  };

  return {
    switcher: { organisations, activeId, switching, onSwitch: organisationId => void switchTo(organisationId) },
    error,
    dismissError: () => setError(null),
  };
}
