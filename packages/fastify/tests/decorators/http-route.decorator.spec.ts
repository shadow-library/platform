/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Route } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { All, Delete, Get, Head, Options, Patch, Post, Put } from '@shadow-library/fastify';

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

      expect(Route).toBeCalledTimes(2);
      expect(Route).toBeCalledWith({ path: '/data', method: Decorator.name.toUpperCase() });
      expect(Route).toBeCalledWith({ operation: { summary: 'Execute', operationId: 'execute' } }, { arrayStrategy: 'replace' });
    });
  });

  it('should derive summary and operationId from camelCase method name', () => {
    class Controller {
      @Get('users/:id')
      static getUserById() {}
    }

    expect(Route).toBeCalledWith({ operation: { summary: 'Get User By Id', operationId: 'getUserById' } }, { arrayStrategy: 'replace' });
  });

  it('should prepend slash to path if missing', () => {
    class Controller {
      @Get('no-slash')
      static noSlash() {}
    }

    expect(Route).toBeCalledWith({ path: '/no-slash', method: 'GET' });
  });
});
