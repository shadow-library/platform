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

  it('should set the field schema options for object fields with additionalProperties, patternProperties, and properties', () => {
    class ObjectFieldSample {
      @Field({
        additionalProperties: true,
      })
      fieldWithAdditionalProps: Record<string, unknown>;

      @Field({
        patternProperties: {
          '^[a-z]+$': { minLength: 1 },
          '^[0-9]+$': { minimum: 0 },
        },
      })
      fieldWithPatternProps: Record<string, unknown>;

      @Field({
        properties: {
          name: { minLength: 1, maxLength: 100 },
          age: { minimum: 0, maximum: 150 },
        },
      })
      fieldWithProps: Record<string, unknown>;
    }

    const additionalPropsOptions = Reflect.getMetadata(METADATA_KEYS.FIELD_OPTIONS, ObjectFieldSample.prototype, 'fieldWithAdditionalProps');
    expect(additionalPropsOptions).toStrictEqual({ additionalProperties: true });

    const patternPropsOptions = Reflect.getMetadata(METADATA_KEYS.FIELD_OPTIONS, ObjectFieldSample.prototype, 'fieldWithPatternProps');
    expect(patternPropsOptions).toStrictEqual({
      patternProperties: {
        '^[a-z]+$': { minLength: 1 },
        '^[0-9]+$': { minimum: 0 },
      },
    });

    const propsOptions = Reflect.getMetadata(METADATA_KEYS.FIELD_OPTIONS, ObjectFieldSample.prototype, 'fieldWithProps');
    expect(propsOptions).toStrictEqual({
      properties: {
        name: { minLength: 1, maxLength: 100 },
        age: { minimum: 0, maximum: 150 },
      },
    });
  });
});
