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
  class AuthInterceptor {}

  describe('when applied to a class', () => {
    it('should set interceptor metadata for single interceptor', () => {
      @UseInterceptors(LoggingInterceptor)
      class TestController {}

      const metadata = Reflect.getMetadata(INTERCEPTOR_METADATA, TestController);
      expect(metadata).toEqual([LoggingInterceptor]);
    });

    it('should set interceptor metadata for multiple interceptors', () => {
      @UseInterceptors(LoggingInterceptor, ValidationInterceptor)
      class TestController {}

      const metadata = Reflect.getMetadata(INTERCEPTOR_METADATA, TestController);
      expect(metadata).toEqual([ValidationInterceptor, LoggingInterceptor]);
    });

    it('should append interceptor metadata when applied multiple times', () => {
      @UseInterceptors(LoggingInterceptor)
      @UseInterceptors(ValidationInterceptor)
      class TestController {}

      const metadata = Reflect.getMetadata(INTERCEPTOR_METADATA, TestController);
      expect(metadata).toEqual([ValidationInterceptor, LoggingInterceptor]);
    });

    it('should handle three interceptors in reverse order', () => {
      @UseInterceptors(LoggingInterceptor, ValidationInterceptor, AuthInterceptor)
      class TestController {}

      const metadata = Reflect.getMetadata(INTERCEPTOR_METADATA, TestController);
      expect(metadata).toEqual([AuthInterceptor, ValidationInterceptor, LoggingInterceptor]);
    });
  });

  describe('when applied to a method', () => {
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

  describe('when applied to both class and method', () => {
    it('should set interceptor metadata independently', () => {
      @UseInterceptors(AuthInterceptor)
      class TestController {
        @UseInterceptors(LoggingInterceptor)
        testMethod() {}
      }

      const controller = new TestController();
      const classMetadata = Reflect.getMetadata(INTERCEPTOR_METADATA, TestController);
      const methodMetadata = Reflect.getMetadata(INTERCEPTOR_METADATA, controller.testMethod);

      expect(classMetadata).toEqual([AuthInterceptor]);
      expect(methodMetadata).toEqual([LoggingInterceptor]);
    });
  });

  describe('error handling', () => {
    it('should throw an error when no interceptors are provided', () => {
      expect(() => {
        @UseInterceptors()
        class TestController {} // eslint-disable-line @typescript-eslint/no-unused-vars
      }).toThrow('UseInterceptors decorator requires at least one interceptor class');
    });

    it('should throw an error when applied to invalid target', () => {
      expect(() => {
        // This simulates applying the decorator to an invalid target
        UseInterceptors(LoggingInterceptor)(null as any);
      }).toThrow('UseInterceptors decorator can only be applied to class or method');
    });

    it('should throw an error when applied to method with undefined descriptor value', () => {
      expect(() => {
        // This simulates applying the decorator to a method with invalid descriptor
        UseInterceptors(LoggingInterceptor)({}, 'testMethod', { value: undefined } as any);
      }).toThrow('UseInterceptors decorator can only be applied to class or method');
    });
  });
});
