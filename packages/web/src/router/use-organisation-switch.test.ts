import { describe, expect, it } from 'bun:test';

import { ApiError } from '../lib/api-error';
import { type OrganisationSwitchSteps, switchOrganisationAndReload } from './use-organisation-switch';

function recordingSteps(switchOutcome: () => Promise<void> = () => Promise.resolve()) {
  const calls: string[] = [];
  const steps: OrganisationSwitchSteps = {
    switchOrganisation: async organisationId => {
      calls.push(`switch:${organisationId}`);
      await switchOutcome();
      return { organisationId };
    },
    queryClient: { clear: () => void calls.push('clear') },
    reload: async () => void calls.push('reload'),
  };
  return { calls, steps };
}

describe('switchOrganisationAndReload', () => {
  it('should drop the cache only after the session has switched, then reload', async () => {
    const { calls, steps } = recordingSteps();
    expect(await switchOrganisationAndReload('acme', steps)).toBeNull();
    expect(calls).toEqual(['switch:acme', 'clear', 'reload']);
  });

  it('should hand back a refusal and leave the cache alone', async () => {
    const refusal = new ApiError(403, { code: 'IAM_002', type: 'Error', message: 'Forbidden' });
    const { calls, steps } = recordingSteps(() => Promise.reject(refusal));
    expect(await switchOrganisationAndReload('acme', steps)).toBe(refusal);
    expect(calls).toEqual(['switch:acme']);
  });

  it('should turn a failure that is not an ApiError into one the caller can render', async () => {
    const { calls, steps } = recordingSteps(() => Promise.reject(new TypeError('boom')));
    const failure = await switchOrganisationAndReload('acme', steps);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure?.code).toBe('ORGANISATION_SWITCH_FAILED');
    expect(calls).toEqual(['switch:acme']);
  });
});
