/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Controller, Route } from '@shadow-library/app';

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
const controllerDecorator = jest.fn();
const routeDecorator = jest.fn();
jest.mock('@shadow-library/app', () => {
  const actual = jest.requireActual('@shadow-library/app') as object;
  return { ...actual, Controller: jest.fn(() => controllerDecorator), Route: jest.fn(() => routeDecorator) };
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

  it(`should strip 'Api' suffix and generate tag`, () => {
    @HttpController()
    class UserApi {}
    expect(Route).toBeCalledWith({ operation: { tags: ['User'] } }, { arrayStrategy: 'replace' });
  });

  it(`should convert camelCase to spaced words in tag`, () => {
    @HttpController()
    class UserAccountController {}
    expect(Route).toBeCalledWith({ operation: { tags: ['User Account'] } }, { arrayStrategy: 'replace' });
  });

  it(`should handle multiple camelCase words and suffix stripping`, () => {
    @HttpController()
    class UserProfileSettingsRoute {}
    expect(Route).toBeCalledWith({ operation: { tags: ['User Profile Settings'] } }, { arrayStrategy: 'replace' });
  });

  it(`should handle class name without any suffix`, () => {
    @HttpController()
    class Health {}
    expect(Route).toBeCalledWith({ operation: { tags: ['Health'] } }, { arrayStrategy: 'replace' });
  });
});
