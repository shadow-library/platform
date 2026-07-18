/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it, jest, mock } from 'bun:test';

/**
 * Importing user defined packages
 */
import { HTTP_CONTROLLER_TYPE } from '@lib/constants';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const app = await import('@shadow-library/app');
const decorator = jest.fn();
const Controller = jest.fn(() => decorator);
mock.module('@shadow-library/app', () => ({ ...app, Controller }));
const { Middleware } = await import('@shadow-library/fastify');

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
