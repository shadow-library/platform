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
const controllerDecorator = jest.fn();
const routeDecorator = jest.fn();
const Controller = jest.fn(() => controllerDecorator);
const Handler = jest.fn(() => routeDecorator);
mock.module('@shadow-library/app', () => ({ ...app, Controller, Handler }));
const { HttpController } = await import('@shadow-library/fastify');

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
    expect(Handler).toBeCalledWith({ operation: { tags: ['User'] } }, { arrayStrategy: 'replace' });
  });

  it(`should convert camelCase to spaced words in tag`, () => {
    @HttpController()
    class UserAccountController {}
    expect(Handler).toBeCalledWith({ operation: { tags: ['User Account'] } }, { arrayStrategy: 'replace' });
  });

  it(`should handle multiple camelCase words and suffix stripping`, () => {
    @HttpController()
    class UserProfileSettingsRoute {}
    expect(Handler).toBeCalledWith({ operation: { tags: ['User Profile Settings'] } }, { arrayStrategy: 'replace' });
  });

  it(`should handle class name without any suffix`, () => {
    @HttpController()
    class Health {}
    expect(Handler).toBeCalledWith({ operation: { tags: ['Health'] } }, { arrayStrategy: 'replace' });
  });
});
