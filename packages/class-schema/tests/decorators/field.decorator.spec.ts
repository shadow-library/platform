/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { METADATA_KEYS } from '@lib/constants';
import { EnumType } from '@lib/enum-type';
import { Field } from '@shadow-library/class-schema';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('@Field', () => {
  class Custom {}

  const StatusEnum = EnumType.create('Status', ['active', 'inactive']);

  class Sample {
    @Field({ minLength: 1, maxLength: 10 })
    fieldString: string;

    @Field()
    fieldNumber: number;

    @Field()
    fieldBoolean: boolean;

    @Field()
    fieldObject: Record<string, number>;

    @Field()
    fieldArray: string[];

    @Field(() => Custom)
    fieldCustom: Custom;

    @Field(() => [Custom])
    fieldCustomArray: Custom[];

    @Field(() => StatusEnum, { description: 'User status' })
    fieldEnum: string;
  }

  [String, Number, Boolean, Object, Array, Custom].forEach(Class => {
    it(`should set the field type as '${Class.name}'`, () => {
      const getType = Reflect.getMetadata(METADATA_KEYS.FIELD_TYPE, Sample.prototype, `field${Class.name}`);
      expect(getType()).toBe(Class);
    });
  });

  it(`should set the field type as '[${Custom.name}]'`, () => {
    const getType = Reflect.getMetadata(METADATA_KEYS.FIELD_TYPE, Sample.prototype, 'fieldCustomArray');
    expect(getType()).toStrictEqual([Custom]);
  });

  it('should set the field type as EnumType', () => {
    const getType = Reflect.getMetadata(METADATA_KEYS.FIELD_TYPE, Sample.prototype, 'fieldEnum');
    expect(getType()).toBe(StatusEnum);
  });

  it('should set the field schema options', () => {
    const options = Reflect.getMetadata(METADATA_KEYS.FIELD_OPTIONS, Sample.prototype, 'fieldString');
    expect(options).toStrictEqual({ minLength: 1, maxLength: 10 });
  });

  it('should set the list of fields', () => {
    const fields = Reflect.getMetadata(METADATA_KEYS.SCHEMA_FIELDS, Sample.prototype);
    expect(fields).toStrictEqual(['fieldString', 'fieldNumber', 'fieldBoolean', 'fieldObject', 'fieldArray', 'fieldCustom', 'fieldCustomArray', 'fieldEnum']);
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
