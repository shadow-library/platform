import { afterAll, afterEach, beforeAll, describe, expect, it, mock, setSystemTime, spyOn } from 'bun:test';

import { type AuthClient, AuthErrorCode, type DirectoryUser } from '@shadow-library/auth';
import { type Logger } from '@shadow-library/common';
import { type RestoreLogger, silenceLogger } from '@shadow-library/common/testing';

import { IdentityDirectoryService } from '@modules/admin/identity-directory.service';

import { ManualTimers } from '../credentials/credential.fixtures';

const START = new Date('2026-10-25T10:00:00Z');
const MINUTE = 60 * 1000;

let restoreLogger: RestoreLogger;
beforeAll(() => (restoreLogger = silenceLogger()));
afterAll(() => restoreLogger());
afterEach(() => setSystemTime());

type Identity = 'answers' | 'fails' | 'hangs';

function directoryOver(users: DirectoryUser[]) {
  let identity: Identity = 'answers';
  const held: (() => void)[] = [];
  const answer = (userIds: string[]): DirectoryUser[] => users.filter(user => userIds.includes(user.userId));
  const lookupUsers = mock((userIds: string[]): Promise<DirectoryUser[]> => {
    if (identity === 'fails') return Promise.reject(AuthErrorCode.DIRECTORY_FAILED.create({ reason: 'directory endpoint returned http 503: unavailable' }));
    if (identity === 'hangs') return new Promise(resolve => held.push(() => resolve(answer(userIds))));
    return Promise.resolve(answer(userIds));
  });
  const timers = new ManualTimers();
  const directory = new IdentityDirectoryService({ lookupUsers } as unknown as AuthClient, timers);
  const warn = spyOn((directory as unknown as { logger: Logger }).logger, 'warn');
  const deadlinePasses = (): void => timers.delays.splice(0).forEach(delay => delay.fire());
  const lateAnswersArrive = async (): Promise<void> => {
    held.splice(0).forEach(release => release());
    await Bun.sleep(0);
  };
  return { directory, lookupUsers, warn, timers, deadlinePasses, lateAnswersArrive, identity: (value: Identity) => void (identity = value) };
}

const ADA = { userId: '2', displayName: 'Ada' };
const GRACE = { userId: '4', firstName: 'Grace', lastName: 'Hopper' };

describe('IdentityDirectoryService', () => {
  it('should ask Identity once for the distinct user ids of a response and name each from its display name, else its full name', async () => {
    const { directory, lookupUsers } = directoryOver([ADA, GRACE, { userId: '6', displayName: '  ' }]);

    const names = await directory.displayNames(['2', '4', '2', undefined, '6', 'seed']);

    expect(lookupUsers.mock.calls).toEqual([[['2', '4', '6']]]);
    expect(Object.fromEntries(names)).toEqual({ '2': 'Ada', '4': 'Grace Hopper', '6': null, seed: null });
  });

  it('should serve cached names, including unknown users, and ask only for the users it has not seen', async () => {
    const { directory, lookupUsers } = directoryOver([ADA, GRACE]);
    await directory.displayNames(['2', '9']);

    const names = await directory.displayNames(['2', '9', '4']);

    expect(lookupUsers.mock.calls).toEqual([[['2', '9']], [['4']]]);
    expect(names.get('2')).toBe('Ada');
    expect(names.get('9')).toBeNull();
  });

  it('should not ask Identity at all when no user id is named', async () => {
    const { directory, lookupUsers } = directoryOver([ADA]);

    const names = await directory.displayNames([undefined, 'seed', 'import', '1'.repeat(20)]);

    expect([...names.values()]).toEqual([null, null, null]);
    expect(lookupUsers).not.toHaveBeenCalled();
  });

  it('should ask again once a name is five minutes old', async () => {
    const { directory, lookupUsers } = directoryOver([ADA]);
    setSystemTime(START);
    await directory.displayNames(['2']);

    setSystemTime(new Date(START.getTime() + 5 * MINUTE - 1));
    await directory.displayNames(['2']);
    setSystemTime(new Date(START.getTime() + 5 * MINUTE));
    await directory.displayNames(['2']);

    expect(lookupUsers).toHaveBeenCalledTimes(2);
  });

  it('should answer null names and warn with the subject ids only when Identity fails, then ask again after half a minute', async () => {
    const { directory, lookupUsers, warn, identity } = directoryOver([ADA]);
    setSystemTime(START);
    identity('fails');

    const names = await directory.displayNames(['2']);
    setSystemTime(new Date(START.getTime() + 29 * 1000));
    await directory.displayNames(['2']);

    expect(names.get('2')).toBeNull();
    expect(lookupUsers).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls).toEqual([[expect.any(String), { subjects: ['2'], code: AuthErrorCode.DIRECTORY_FAILED.code }]]);

    identity('answers');
    setSystemTime(new Date(START.getTime() + 30 * 1000));
    expect((await directory.displayNames(['2'])).get('2')).toBe('Ada');
  });

  it('should keep the name a subject last had while Identity fails', async () => {
    const { directory, identity } = directoryOver([ADA]);
    setSystemTime(START);
    await directory.displayNames(['2']);

    identity('fails');
    setSystemTime(new Date(START.getTime() + 6 * MINUTE));

    expect((await directory.displayNames(['2'])).get('2')).toBe('Ada');
  });

  it('should answer by the deadline with no name when Identity does not answer, asking once for concurrent requests', async () => {
    const { directory, lookupUsers, warn, timers, deadlinePasses, identity } = directoryOver([ADA]);
    identity('hangs');

    const first = directory.displayNames(['2']);
    const second = directory.displayNames(['2']);
    deadlinePasses();

    expect([(await first).get('2'), (await second).get('2')]).toEqual([null, null]);
    expect(lookupUsers).toHaveBeenCalledTimes(1);
    expect(timers.delays).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.any(String), { subjects: ['2'] });
  });

  it('should keep a late answer for the next request and wait out the backoff before asking again', async () => {
    const { directory, lookupUsers, deadlinePasses, lateAnswersArrive, identity } = directoryOver([ADA]);
    setSystemTime(START);
    identity('hangs');
    const timedOut = directory.displayNames(['2']);
    deadlinePasses();
    await timedOut;

    expect((await directory.displayNames(['2'])).get('2')).toBeNull();
    await lateAnswersArrive();
    expect((await directory.displayNames(['2'])).get('2')).toBe('Ada');
    expect(lookupUsers).toHaveBeenCalledTimes(1);
  });

  it('should ask again once the backoff after a deadline has passed, even while the first lookup still hangs', async () => {
    const { directory, lookupUsers, deadlinePasses, identity } = directoryOver([ADA]);
    setSystemTime(START);
    identity('hangs');
    const timedOut = directory.displayNames(['2']);
    deadlinePasses();
    await timedOut;

    identity('answers');
    setSystemTime(new Date(START.getTime() + 30 * 1000));

    expect((await directory.displayNames(['2'])).get('2')).toBe('Ada');
    expect(lookupUsers).toHaveBeenCalledTimes(2);
  });

  it('should forget the oldest subject once a thousand are cached', async () => {
    const { directory, lookupUsers } = directoryOver([]);
    await directory.displayNames(Array.from({ length: 1001 }, (_, index) => `${index}`));

    await directory.displayNames(['1000']);
    await directory.displayNames(['0']);

    expect(lookupUsers.mock.calls.slice(1)).toEqual([[['0']]]);
  });

  it('should add the editor name to each item, null for an item no one is named on', async () => {
    const { directory } = directoryOver([ADA]);

    const items = await directory.withEditorNames([{ version: 1, createdBy: '2' }, { version: 2 }, { version: 3, createdBy: '9' }]);

    expect(items).toEqual([
      { version: 1, createdBy: '2', createdByName: 'Ada' },
      { version: 2, createdByName: null },
      { version: 3, createdBy: '9', createdByName: null },
    ]);
    expect(await directory.withEditorName({ createdBy: '2' })).toEqual({ createdBy: '2', createdByName: 'Ada' });
  });
});
