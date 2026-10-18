import { describe, expect, it } from 'bun:test';

import { AuthGuardErrorCode } from '@shadow-library/auth/module';

import { SYNAPSE_PERMISSIONS } from '@modules/auth';
import { AccessController } from '@modules/admin/access.controller';

import { asPrincipal, BOT, caller, expectFailure, NOVEL_FORGE, userWith } from './admin.fixtures';

const controller = new AccessController(caller);

describe('AccessController', () => {
  it('should report only the permissions the PDP grants the user', async () => {
    const access = await asPrincipal(userWith('operator'), () => controller.getAccess());

    expect(access.permissions).toEqual([SYNAPSE_PERMISSIONS.catalogRead, SYNAPSE_PERMISSIONS.catalogWrite, SYNAPSE_PERMISSIONS.usageRead]);
  });

  it('should report every catalog permission, and not credential management, to an admin', async () => {
    const access = await asPrincipal(userWith('admin'), () => controller.getAccess());

    expect(access.permissions).toEqual(Object.values(SYNAPSE_PERMISSIONS).filter(permission => permission !== SYNAPSE_PERMISSIONS.credentialsManage));
  });

  it('should report credential management alone to a credentials admin', async () => {
    const access = await asPrincipal(userWith('credentialsAdmin'), () => controller.getAccess());

    expect(access.permissions).toEqual([SYNAPSE_PERMISSIONS.credentialsManage]);
  });

  it('should report no permission to a user without a synapse role', async () => {
    const access = await asPrincipal({ kind: 'user', sub: 'user-nobody', org: '1', scopes: [], claims: {} }, () => controller.getAccess());

    expect(access.permissions).toEqual([]);
  });

  it('should refuse a service and a bot', async () => {
    for (const principal of [NOVEL_FORGE, BOT]) {
      await expectFailure(
        asPrincipal(principal, () => controller.getAccess()),
        AuthGuardErrorCode.IAM_002,
      );
    }
  });
});
