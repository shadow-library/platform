import { describe, expect, it } from 'bun:test';

import { ApiError } from '../lib/api-error';
import { type OrganisationSwitchSteps, switchOrganisationAndReload } from './use-organisation-switch';

interface RecordingOutcomes {
  switch?: () => Promise<void>;
  reload?: () => Promise<void>;
}

function recordingSteps(outcomes: RecordingOutcomes = {}) {
  const calls: string[] = [];
  const steps: OrganisationSwitchSteps = {
    switchOrganisation: async organisationId => {
      calls.push(`switch:${organisationId}`);
      await outcomes.switch?.();
      return { organisationId };
    },
    queryClient: { clear: () => void calls.push('clear') },
    reload: async () => {
      calls.push('reload');
      await outcomes.reload?.();
    },
    reloadDocument: () => void calls.push('reloadDocument'),
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
    const { calls, steps } = recordingSteps({ switch: () => Promise.reject(refusal) });
    expect(await switchOrganisationAndReload('acme', steps)).toBe(refusal);
    expect(calls).toEqual(['switch:acme']);
  });

  it('should turn a failure that is not an ApiError into one the caller can render', async () => {
    const { calls, steps } = recordingSteps({ switch: () => Promise.reject(new TypeError('boom')) });
    const failure = await switchOrganisationAndReload('acme', steps);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure?.code).toBe('ORGANISATION_SWITCH_FAILED');
    expect(calls).toEqual(['switch:acme']);
  });

  it('should reload the whole document when the in-app reload fails after a switch', async () => {
    const { calls, steps } = recordingSteps({ reload: () => Promise.reject(new Error('loader blew up')) });
    expect(await switchOrganisationAndReload('acme', steps)).toBeNull();
    expect(calls).toEqual(['switch:acme', 'clear', 'reload', 'reloadDocument']);
  });

  it('should reload the whole document when the in-app reload throws before returning a promise', async () => {
    const { calls, steps } = recordingSteps();
    steps.reload = () => {
      throw new Error('router gone');
    };
    expect(await switchOrganisationAndReload('acme', steps)).toBeNull();
    expect(calls).toEqual(['switch:acme', 'clear', 'reloadDocument']);
  });
});
