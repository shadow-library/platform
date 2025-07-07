/**
 * Importing npm packages
 */
import { describe, expect, it } from '@jest/globals';

/**
 * Importing user defined packages
 */
import { SENSITIVE_FIELDS_METADATA } from '@lib/constants';
import { Sensitive } from '@shadow-library/fastify';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('@Sensitive', () => {
  it('should add sensitive field to class metadata', () => {
    class TestClass {
      @Sensitive()
      sensitiveField: string;
    }

    const sensitiveFields = Reflect.getMetadata(SENSITIVE_FIELDS_METADATA, TestClass);
    expect(sensitiveFields).toStrictEqual(['sensitiveField']);
  });

  it('should add multiple sensitive fields to class metadata', () => {
    class TestClass {
      @Sensitive()
      password: string;

      @Sensitive()
      apiKey: string;

      regularField: string;
    }

    const sensitiveFields = Reflect.getMetadata(SENSITIVE_FIELDS_METADATA, TestClass);
    expect(sensitiveFields).toStrictEqual(['password', 'apiKey']);
  });

  it('should work with inheritance', () => {
    class BaseClass {
      @Sensitive()
      baseSecret: string;
    }

    class DerivedClass extends BaseClass {
      @Sensitive()
      derivedSecret: string;

      normalField: string;
    }

    const baseSensitiveFields = Reflect.getMetadata(SENSITIVE_FIELDS_METADATA, BaseClass);
    const derivedSensitiveFields = Reflect.getMetadata(SENSITIVE_FIELDS_METADATA, DerivedClass);
    expect(baseSensitiveFields).toStrictEqual(['baseSecret']);
    expect(derivedSensitiveFields).toStrictEqual(['baseSecret', 'derivedSecret']);
  });

  it('should handle empty class with no sensitive fields', () => {
    class TestClass {
      regularField: string;
    }

    const sensitiveFields = Reflect.getMetadata(SENSITIVE_FIELDS_METADATA, TestClass);
    expect(sensitiveFields).toBeUndefined();
  });
});
