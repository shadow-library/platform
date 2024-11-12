/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { FIELD_OPTIONS_METADATA, FIELD_TYPE_METADATA, SCHEMA_FIELDS_METADATA } from '@lib/constants';
import { Field } from '@shadow-library/class-schema';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('@Field', () => {
  /* eslint-disable-next-line @typescript-eslint/no-extraneous-class */
  class Custom {}

  class Sample {
    @Field()
    fieldString: string;

    @Field()
    fieldNumber: number;

    @Field()
    fieldBoolean: boolean;

    @Field({ patternProperties: {} })
    fieldObject: Record<string, number>;

    @Field()
    fieldArray: string[];

    @Field(() => Custom)
    fieldCustom: Custom;

    @Field(() => [Custom])
    fieldCustomArray: Custom[];
  }

  [String, Number, Boolean, Object, Array, Custom].forEach(Class => {
    it(`should set the field type as '${Class.name}'`, () => {
      const getType = Reflect.getMetadata(FIELD_TYPE_METADATA, Sample.prototype, `field${Class.name}`);
      expect(getType()).toBe(Class);
    });
  });

  it(`should set the field type as '[${Custom.name}]'`, () => {
    const getType = Reflect.getMetadata(FIELD_TYPE_METADATA, Sample.prototype, 'fieldCustomArray');
    expect(getType()).toStrictEqual([Custom]);
  });

  it('should set the field schema options', () => {
    const options = Reflect.getMetadata(FIELD_OPTIONS_METADATA, Sample.prototype, 'fieldObject');
    expect(options).toStrictEqual({ patternProperties: {} });
  });

  it('should set the list of fields', () => {
    const fields = Reflect.getMetadata(SCHEMA_FIELDS_METADATA, Sample.prototype);
    expect(fields).toStrictEqual(['fieldString', 'fieldNumber', 'fieldBoolean', 'fieldObject', 'fieldArray', 'fieldCustom', 'fieldCustomArray']);
  });

  it('should throw error for symbol keys', () => {
    const symbol = Symbol('key');
    expect(() => {
      class ABC {
        @Field()
        [symbol]: string;
      }

      return ABC;
    }).toThrow(Error);
  });
});
