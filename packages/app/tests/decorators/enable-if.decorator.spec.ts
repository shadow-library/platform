/**
 * Importing npm packages
 */
import { describe, expect, it } from '@jest/globals';
import { Reflector } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { INTERNAL_OPERATION_METADATA } from '@lib/constants';
import { EnableIf } from '@shadow-library/app';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('EnableIf Decorator', () => {
  it('should add enableIf metadata to a class', () => {
    @EnableIf(true)
    class TestController {}

    const metadata = Reflector.getMetadata(INTERNAL_OPERATION_METADATA, TestController);
    expect(metadata).toBeDefined();
    expect(metadata.enableIf).toBe(true);
  });

  it('should add enableIf metadata to a method', () => {
    class TestController {
      @EnableIf(false)
      testMethod() {}
    }

    const metadata = Reflector.getMetadata(INTERNAL_OPERATION_METADATA, TestController.prototype.testMethod);
    expect(metadata).toBeDefined();
    expect(metadata.enableIf).toBe(false);
  });

  it('should accept a function as condition', () => {
    const condition = () => true;

    @EnableIf(condition)
    class TestController {}

    const metadata = Reflector.getMetadata(INTERNAL_OPERATION_METADATA, TestController);
    expect(metadata).toBeDefined();
    expect(metadata.enableIf).toBe(condition);
  });

  it('should work when applied to method with function condition', () => {
    const shouldEnable = () => Math.random() > 0.5;

    class TestController {
      @EnableIf(shouldEnable)
      randomMethod() {}
    }

    const metadata = Reflector.getMetadata(INTERNAL_OPERATION_METADATA, TestController.prototype.randomMethod);
    expect(metadata).toBeDefined();
    expect(metadata.enableIf).toBe(shouldEnable);
    expect(typeof metadata.enableIf).toBe('function');
  });
});
