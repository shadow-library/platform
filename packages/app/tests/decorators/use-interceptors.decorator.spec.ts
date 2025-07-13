/**
 * Importing npm packages
 */
import { describe, expect, it } from '@jest/globals';

/**
 * Importing user defined packages
 */
import { INTERCEPTOR_METADATA } from '@lib/constants';
import { UseInterceptors } from '@shadow-library/app';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('UseInterceptors', () => {
  class LoggingInterceptor {}
  class ValidationInterceptor {}

  it('should set interceptor metadata for single interceptor', () => {
    class TestController {
      @UseInterceptors(LoggingInterceptor)
      testMethod() {}
    }

    const controller = new TestController();
    const metadata = Reflect.getMetadata(INTERCEPTOR_METADATA, controller.testMethod);
    expect(metadata).toEqual([LoggingInterceptor]);
  });

  it('should set interceptor metadata for multiple interceptors', () => {
    class TestController {
      @UseInterceptors(LoggingInterceptor, ValidationInterceptor)
      testMethod() {}
    }

    const controller = new TestController();
    const metadata = Reflect.getMetadata(INTERCEPTOR_METADATA, controller.testMethod);
    expect(metadata).toEqual([ValidationInterceptor, LoggingInterceptor]);
  });

  it('should append interceptor metadata when applied multiple times', () => {
    class TestController {
      @UseInterceptors(LoggingInterceptor)
      @UseInterceptors(ValidationInterceptor)
      testMethod() {}
    }

    const controller = new TestController();
    const metadata = Reflect.getMetadata(INTERCEPTOR_METADATA, controller.testMethod);
    expect(metadata).toEqual([ValidationInterceptor, LoggingInterceptor]);
  });

  it('should handle mixed decorators on multiple methods', () => {
    class TestController {
      @UseInterceptors(LoggingInterceptor)
      methodOne() {}

      @UseInterceptors(ValidationInterceptor)
      methodTwo() {}
    }

    const controller = new TestController();
    const methodOneMetadata = Reflect.getMetadata(INTERCEPTOR_METADATA, controller.methodOne);
    const methodTwoMetadata = Reflect.getMetadata(INTERCEPTOR_METADATA, controller.methodTwo);

    expect(methodOneMetadata).toEqual([LoggingInterceptor]);
    expect(methodTwoMetadata).toEqual([ValidationInterceptor]);
  });
});
