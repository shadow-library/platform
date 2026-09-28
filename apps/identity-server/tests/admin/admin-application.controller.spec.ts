import { beforeAll, describe, expect, it, mock } from 'bun:test';

import { ContextBinder } from '@server/modules/access';
import { AdminApplicationController } from '@server/modules/admin/admin-application.controller';
import { type UpdateApplicationBody } from '@server/modules/admin/admin-application.dto';

const APPLICATION = { id: 5, name: 'pulse', ownerOrganisationId: null, isActive: true, visibility: 'PUBLIC' };

function controller() {
  const invalidateGlobal = mock(() => Promise.resolve());
  const applicationService = { getApplicationByIdOrThrow: () => APPLICATION, updateApplication: () => Promise.resolve() };
  const audit = { record: () => Promise.resolve() };
  const instance = new AdminApplicationController(applicationService as never, {} as never, { invalidateGlobal } as never, {} as never, {} as never, audit as never);
  return { instance, invalidateGlobal };
}

describe('AdminApplicationController', () => {
  beforeAll(() => {
    const request = { auth: { actor: { session: { userId: 1n }, organisationId: '1', scope: 'platform' } } };
    const context = { getRequest: () => request, extend: (extension: object) => Object.assign(context, extension) };
    new ContextBinder(context as never);
  });

  describe('updateApplication', () => {
    for (const isActive of [false, true]) {
      it(`should drop every cached grant set at once when an application is ${isActive ? 'reactivated' : 'deactivated'}`, async () => {
        const { instance, invalidateGlobal } = controller();

        await instance.updateApplication({ applicationId: APPLICATION.id }, { isActive } as UpdateApplicationBody);

        expect(invalidateGlobal).toHaveBeenCalledTimes(1);
      });
    }

    it('should keep cached grant sets when nothing that decides access changed', async () => {
      const { instance, invalidateGlobal } = controller();

      await instance.updateApplication({ applicationId: APPLICATION.id }, { displayName: 'Pulse' } as UpdateApplicationBody);

      expect(invalidateGlobal).not.toHaveBeenCalled();
    });

    it('should drop cached grant sets once when visibility and activation change together', async () => {
      const { instance, invalidateGlobal } = controller();

      await instance.updateApplication({ applicationId: APPLICATION.id }, { isActive: true, visibility: 'RESTRICTED' } as UpdateApplicationBody);

      expect(invalidateGlobal).toHaveBeenCalledTimes(1);
    });
  });
});
