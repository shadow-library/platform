import 'reflect-metadata';

import { afterEach, jest, mock } from 'bun:test';

/** Config (from @shadow-library/common) watches files via chokidar; stub it so tests don't spawn watchers. */
mock.module('chokidar', () => ({
  watch: jest.fn(() => ({ on: jest.fn(), close: jest.fn() })),
}));

/** Restore `spyOn` mocks after each test so spies on shared objects (Config, Reflect, utils) don't bleed between tests in a file. */
afterEach(() => {
  jest.restoreAllMocks();
});
