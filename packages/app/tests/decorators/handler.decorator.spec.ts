/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { HANDLER_METADATA } from '@lib/constants';
import { Handler } from '@shadow-library/app';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('HandlerDecorator', () => {
  const handlerMetadataOne = { op: 'GET', auth: { jwt: true } };
  const handlerMetadataTwo = { path: '/users', auth: { oauth: true } };
  const handlerMetadataThree = { auth: { jwt: false } };

  @Handler(handlerMetadataThree)
  class CatController {
    @Handler(handlerMetadataOne)
    methodOne() {}

    @Handler(handlerMetadataOne)
    @Handler(handlerMetadataTwo)
    methodTwo() {}

    @Handler()
    methodThree() {}
  }

  const controller = new CatController();

  it('should set handler metadata for method', () => {
    const metadata = Reflect.getMetadata(HANDLER_METADATA, controller.methodOne);
    expect(metadata).toEqual(handlerMetadataOne);
  });

  it('should set handler metadata for class', () => {
    const metadata = Reflect.getMetadata(HANDLER_METADATA, CatController);
    expect(metadata).toStrictEqual(handlerMetadataThree);
  });

  it('should set default handler metadata', () => {
    const metadata = Reflect.getMetadata(HANDLER_METADATA, controller.methodThree);
    expect(metadata).toStrictEqual({});
  });

  it('should append handler metadata', () => {
    const metadata = Reflect.getMetadata(HANDLER_METADATA, controller.methodTwo);
    expect(metadata).toStrictEqual({ op: 'GET', path: '/users', auth: { jwt: true, oauth: true } });
  });

  it('should replace handler metadata when using replace option', () => {
    class TestController {
      @Handler({ roles: ['user'] }, { arrayStrategy: 'replace' })
      @Handler({ roles: ['admin'] })
      testMethod() {}
    }

    const instance = new TestController();
    const metadata = Reflect.getMetadata(HANDLER_METADATA, instance.testMethod);
    expect(metadata).toStrictEqual({ roles: ['user'] });
  });
});
