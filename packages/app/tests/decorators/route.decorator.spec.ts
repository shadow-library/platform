/**
 * Importing npm packages
 */
import { describe, expect, it } from '@jest/globals';

/**
 * Importing user defined packages
 */
import { ROUTE_METADATA } from '@lib/constants';
import { Route } from '@shadow-library/app';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('RouteDecorator', () => {
  const routeMetadataOne = { op: 'GET', auth: { jwt: true } };
  const routeMetadataTwo = { path: '/users', auth: { oauth: true } };
  const routeMetadataThree = { auth: { jwt: false } };

  @Route(routeMetadataThree)
  class CatController {
    @Route(routeMetadataOne)
    methodOne() {}

    @Route(routeMetadataOne)
    @Route(routeMetadataTwo)
    methodTwo() {}

    @Route()
    methodThree() {}
  }

  const controller = new CatController();

  it('should set route metadata for method', () => {
    const metadata = Reflect.getMetadata(ROUTE_METADATA, controller.methodOne);
    expect(metadata).toEqual(routeMetadataOne);
  });

  it('should set route metadata for class', () => {
    const metadata = Reflect.getMetadata(ROUTE_METADATA, CatController);
    expect(metadata).toStrictEqual(routeMetadataThree);
  });

  it('should set default route metadata', () => {
    const metadata = Reflect.getMetadata(ROUTE_METADATA, controller.methodThree);
    expect(metadata).toStrictEqual({});
  });

  it('should append route metadata', () => {
    const metadata = Reflect.getMetadata(ROUTE_METADATA, controller.methodTwo);
    expect(metadata).toStrictEqual({ op: 'GET', path: '/users', auth: { jwt: true, oauth: true } });
  });

  it('should replace route metadata when using replace option', () => {
    class TestController {
      @Route({ roles: ['user'] }, { arrayStrategy: 'replace' })
      @Route({ roles: ['admin'] })
      testMethod() {}
    }

    const instance = new TestController();
    const metadata = Reflect.getMetadata(ROUTE_METADATA, instance.testMethod);
    expect(metadata).toStrictEqual({ roles: ['user'] });
  });
});
