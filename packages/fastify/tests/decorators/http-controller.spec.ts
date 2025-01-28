/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Controller } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { HTTP_CONTROLLER_TYPE } from '@lib/constants';
import { HttpController } from '@shadow-library/fastify';

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

describe('@HttpController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it(`should enhance the class with the base path metadata`, () => {
    @HttpController('/test')
    class TestController {}
    expect(Controller).toBeCalledWith({ path: '/test', [HTTP_CONTROLLER_TYPE]: 'router' });
  });

  it(`should enhance the class with the default path metadata`, () => {
    @HttpController()
    class TestController {}
    expect(Controller).toBeCalledWith({ path: '', [HTTP_CONTROLLER_TYPE]: 'router' });
  });
});
