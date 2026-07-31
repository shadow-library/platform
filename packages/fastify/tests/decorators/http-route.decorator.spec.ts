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
const { All, Delete, Get, Head, Options, Patch, Post, Put } = await import('@shadow-library/fastify');

describe('HTTP Methods Decorators', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  [All, Delete, Get, Head, Options, Patch, Post, Put].forEach(Decorator => {
    it(`should enhance the method with the request metadata for ${Decorator.name}`, () => {
      const path = '/data';
      class Controller {
        @Decorator('data')
        static execute() {}
      }

      expect(Handler).toBeCalledTimes(2);
      expect(Handler).toBeCalledWith({ path: '/data', method: Decorator.name.toUpperCase() });
      expect(Handler).toBeCalledWith({ operation: { summary: 'Execute', operationId: 'execute' } }, { arrayStrategy: 'replace' });
    });
  });

  it('should derive summary and operationId from camelCase method name', () => {
    class Controller {
      @Get('users/:id')
      static getUserById() {}
    }

    expect(Handler).toBeCalledWith({ operation: { summary: 'Get User By Id', operationId: 'getUserById' } }, { arrayStrategy: 'replace' });
  });

  it('should prepend slash to path if missing', () => {
    class Controller {
      @Get('no-slash')
      static noSlash() {}
    }

    expect(Handler).toBeCalledWith({ path: '/no-slash', method: 'GET' });
  });
});
