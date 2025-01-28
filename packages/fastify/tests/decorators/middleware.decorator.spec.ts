/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Controller } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { HTTP_CONTROLLER_TYPE } from '@lib/constants';
import { Middleware } from '@shadow-library/fastify';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const decorator = jest.fn();
jest.mock('@shadow-library/app', () => {
  const actual = jest.requireActual('@shadow-library/app') as object;
  return { ...actual, Controller: jest.fn(() => decorator) };
});

describe('@Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should throw an error when applying decorator to a class without a "generate()" method', () => {
    expect(() => {
      @Middleware()
      class InvalidMiddleware {}
      return InvalidMiddleware;
    }).toThrowError();
  });

  it('should mark the class as middleware', () => {
    @Middleware()
    class ValidMiddleware {
      generate(): void {}
    }

    expect(Controller).toBeCalledWith({ [HTTP_CONTROLLER_TYPE]: 'middleware', generates: true, type: 'preHandler', weight: 0 });
  });
});
