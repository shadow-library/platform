/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it, jest, mock } from 'bun:test';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const app = await import('@shadow-library/app');
const decorator = jest.fn();
const Handler = jest.fn(() => decorator);
mock.module('@shadow-library/app', () => ({ ...app, Handler }));
const { Version } = await import('@shadow-library/fastify');

describe('@Version', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should apply version metadata to a route', () => {
    class TestController {
      @Version(1)
      testMethod() {}
    }

    expect(Handler).toBeCalledWith({ version: 1 });
  });
});
