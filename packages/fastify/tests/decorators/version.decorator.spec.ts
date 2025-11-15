/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Route } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { Version } from '@shadow-library/fastify';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const decorator = jest.fn();
jest.mock('@shadow-library/app', () => {
  const actual = jest.requireActual('@shadow-library/app') as object;
  return { ...actual, Route: jest.fn(() => decorator) };
});

describe('@Version', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should apply version metadata to a route', () => {
    class TestController {
      @Version(1)
      testMethod() {}
    }

    expect(Route).toBeCalledWith({ version: 1 });
  });
});
