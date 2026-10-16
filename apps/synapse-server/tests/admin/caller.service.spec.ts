import { describe, expect, it } from 'bun:test';

import { AuthGuardErrorCode } from '@shadow-library/auth/module';

import { SYNAPSE_PERMISSIONS } from '@modules/auth';

import { ANONYMOUS_SERVICE, asPrincipal, BOT, caller, checkOptions, expectFailure, NOVEL_FORGE, userWith } from './admin.fixtures';

describe('CallerService', () => {
  it('should resolve the calling app from a service principal client id', async () => {
    const resolved = await asPrincipal(NOVEL_FORGE, async () => caller.service());

    expect(resolved.app).toBe('novel-forge');
  });

  it('should refuse a user, a bot and a service without a client id on a service route', async () => {
    for (const principal of [userWith('admin'), BOT, ANONYMOUS_SERVICE]) {
      await expectFailure(
        asPrincipal(principal, async () => caller.service()),
        AuthGuardErrorCode.IAM_002,
      );
    }
  });

  it('should refuse a service and a bot on a user route', async () => {
    for (const principal of [NOVEL_FORGE, BOT]) {
      await expectFailure(
        asPrincipal(principal, async () => caller.user()),
        AuthGuardErrorCode.IAM_002,
      );
    }
  });

  it('should report only the permissions the PDP grants the user', async () => {
    const granted = await asPrincipal(userWith('operator'), async () => caller.permissions(caller.user(), Object.values(SYNAPSE_PERMISSIONS)));

    expect(granted.has(SYNAPSE_PERMISSIONS.catalogWrite)).toBe(true);
    expect(granted.has(SYNAPSE_PERMISSIONS.budgetsWrite)).toBe(false);
    expect(granted.has(SYNAPSE_PERMISSIONS.providersWrite)).toBe(false);
  });

  it('should check sensitive permissions with the high-risk cache and ordinary ones without it', async () => {
    checkOptions.length = 0;

    await asPrincipal(userWith('admin'), async () =>
      caller.permissions(caller.user(), [SYNAPSE_PERMISSIONS.catalogWrite], [SYNAPSE_PERMISSIONS.budgetsWrite, SYNAPSE_PERMISSIONS.providersWrite]),
    );

    expect(checkOptions).toEqual([
      { action: SYNAPSE_PERMISSIONS.catalogWrite, highRisk: false },
      { action: SYNAPSE_PERMISSIONS.budgetsWrite, highRisk: true },
      { action: SYNAPSE_PERMISSIONS.providersWrite, highRisk: true },
    ]);
  });
});
