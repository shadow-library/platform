/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { METADATA_KEYS } from '@lib/constants';
import { FieldMetadata } from '@shadow-library/class-schema';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('@FieldMetadata', () => {
  it('should set field metadata options', () => {
    const options = { customProperty: 'value', anotherProperty: 123 };

    class Sample {
      @FieldMetadata(options)
      testField: string;
    }

    const metadata = Reflect.getMetadata(METADATA_KEYS.FIELD_OPTIONS, Sample.prototype, 'testField');
    expect(metadata).toStrictEqual(options);
  });

  it('should set multiple field metadata options', () => {
    const stringOptions = { format: 'email', minLength: 5 };
    const numberOptions = { minimum: 0, maximum: 100 };

    class Sample {
      @FieldMetadata(stringOptions)
      email: string;

      @FieldMetadata(numberOptions)
      score: number;
    }

    const emailMetadata = Reflect.getMetadata(METADATA_KEYS.FIELD_OPTIONS, Sample.prototype, 'email');
    const scoreMetadata = Reflect.getMetadata(METADATA_KEYS.FIELD_OPTIONS, Sample.prototype, 'score');

    expect(emailMetadata).toStrictEqual(stringOptions);
    expect(scoreMetadata).toStrictEqual(numberOptions);
  });

  it('should update existing metadata when called multiple times', () => {
    const initialOptions = { prop1: 'value1' };
    const additionalOptions = { prop2: 'value2' };

    class Sample {
      @FieldMetadata(additionalOptions)
      @FieldMetadata(initialOptions)
      testField: string;
    }

    const metadata = Reflect.getMetadata(METADATA_KEYS.FIELD_OPTIONS, Sample.prototype, 'testField');
    expect(metadata).toStrictEqual({ ...initialOptions, ...additionalOptions });
  });

  it('should throw error for symbol keys', () => {
    const symbol = Symbol('key');
    const options = { test: 'value' };

    expect(() => {
      class Sample {
        @FieldMetadata(options)
        [symbol]: string;
      }

      return Sample;
    }).toThrow('Cannot apply @Field() to symbol Symbol(key)');
  });
});
