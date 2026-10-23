import 'reflect-metadata';

import { afterEach, jest, mock } from 'bun:test';

// Config watches files via chokidar; stubbed so tests don't spawn watchers.
mock.module('chokidar', () => ({
  watch: jest.fn(() => ({ on: jest.fn(), close: jest.fn() })),
}));

afterEach(() => {
  jest.restoreAllMocks();
});
