/**
 * Importing npm packages
 */
import { describe, expect, it } from '@jest/globals';

/**
 * Importing user defined packages
 */
import { INTERCEPTOR_METADATA } from '@lib/constants';
import { CallHandler, Interceptor, InterceptorConfig, InterceptorContext, UseInterceptor, UseInterceptors } from '@shadow-library/app';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('UseInterceptors', () => {
  class LoggingInterceptor {}
  class ValidationInterceptor implements Interceptor {
    intercept(context: InterceptorContext, next: CallHandler) {
      return next.handle();
    }
  }
  class CacheInterceptor {}

  it('should set interceptor metadata for single interceptor (legacy)', () => {
    class TestController {
      @UseInterceptors(LoggingInterceptor)
      testMethod() {}
    }

    const controller = new TestController();
    const metadata: InterceptorConfig[] = Reflect.getMetadata(INTERCEPTOR_METADATA, controller.testMethod);
    expect(metadata).toEqual([{ token: LoggingInterceptor, options: undefined }]);
  });

  it('should set interceptor metadata for multiple interceptors (legacy)', () => {
    class TestController {
      @UseInterceptors(LoggingInterceptor, ValidationInterceptor)
      testMethod() {}
    }

    const controller = new TestController();
    const metadata: InterceptorConfig[] = Reflect.getMetadata(INTERCEPTOR_METADATA, controller.testMethod);
    expect(metadata).toEqual([
      { token: ValidationInterceptor, options: undefined },
      { token: LoggingInterceptor, options: undefined },
    ]);
  });

  it('should set interceptor metadata for single interceptor with options', () => {
    class TestController {
      @UseInterceptor(ValidationInterceptor, { message: 'Validation failed' })
      testMethod() {}
    }

    const controller = new TestController();
    const metadata: InterceptorConfig[] = Reflect.getMetadata(INTERCEPTOR_METADATA, controller.testMethod);
    expect(metadata).toEqual([{ token: ValidationInterceptor, options: { message: 'Validation failed' } }]);
  });

  it('should set interceptor metadata with options', () => {
    class TestController {
      @UseInterceptors(
        { token: CacheInterceptor, options: { ttl: 3600, prefix: 'user' } },
        { token: LoggingInterceptor, options: { level: 'debug' } },
        { token: ValidationInterceptor },
      )
      testMethod() {}
    }

    const controller = new TestController();
    const metadata: InterceptorConfig[] = Reflect.getMetadata(INTERCEPTOR_METADATA, controller.testMethod);
    expect(metadata).toEqual([
      { token: ValidationInterceptor },
      { token: LoggingInterceptor, options: { level: 'debug' } },
      { token: CacheInterceptor, options: { ttl: 3600, prefix: 'user' } },
    ]);
  });

  it('should append interceptor metadata when applied multiple times', () => {
    class TestController {
      @UseInterceptors({ token: LoggingInterceptor, options: { level: 'info' } })
      @UseInterceptors(ValidationInterceptor)
      testMethod() {}
    }

    const controller = new TestController();
    const metadata: InterceptorConfig[] = Reflect.getMetadata(INTERCEPTOR_METADATA, controller.testMethod);
    expect(metadata).toEqual([{ token: ValidationInterceptor }, { token: LoggingInterceptor, options: { level: 'info' } }]);
  });

  it('should handle mixed decorators on multiple methods', () => {
    class TestController {
      @UseInterceptors({ token: LoggingInterceptor, options: { level: 'debug' } })
      methodOne() {}

      @UseInterceptors(ValidationInterceptor)
      methodTwo() {}
    }

    const controller = new TestController();
    const methodOneMetadata: InterceptorConfig[] = Reflect.getMetadata(INTERCEPTOR_METADATA, controller.methodOne);
    const methodTwoMetadata: InterceptorConfig[] = Reflect.getMetadata(INTERCEPTOR_METADATA, controller.methodTwo);

    expect(methodOneMetadata).toEqual([{ token: LoggingInterceptor, options: { level: 'debug' } }]);
    expect(methodTwoMetadata).toEqual([{ token: ValidationInterceptor, options: undefined }]);
  });

  it('should handle mixed legacy and new syntax', () => {
    class TestController {
      @UseInterceptors(
        LoggingInterceptor, // legacy syntax
        { token: CacheInterceptor, options: { ttl: 300 } }, // new syntax
      )
      testMethod() {}
    }

    const controller = new TestController();
    const metadata: InterceptorConfig[] = Reflect.getMetadata(INTERCEPTOR_METADATA, controller.testMethod);
    expect(metadata).toEqual([
      { token: CacheInterceptor, options: { ttl: 300 } },
      { token: LoggingInterceptor, options: undefined },
    ]);
  });
});
