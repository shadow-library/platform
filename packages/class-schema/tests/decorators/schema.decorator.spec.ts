/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { SCHEMA_OPTIONS_METADATA } from '@lib/constants';
import { Schema } from '@shadow-library/class-schema';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('@Schema', () => {
  it('should decorate the class with schema options', () => {
    @Schema({ $id: 'id', patternProperties: {} })
    /* eslint-disable-next-line @typescript-eslint/no-extraneous-class */
    class Sample {}

    const options = Reflect.getMetadata(SCHEMA_OPTIONS_METADATA, Sample);
    expect(options).toStrictEqual({ $id: 'id', type: 'object', patternProperties: {} });
  });

  it('should set the default $id field', () => {
    @Schema()
    /* eslint-disable-next-line @typescript-eslint/no-extraneous-class */
    class Sample {}

    const options = Reflect.getMetadata(SCHEMA_OPTIONS_METADATA, Sample);
    expect(options).toStrictEqual({ $id: expect.stringMatching(/^class-schema:Sample-[0-9]+$/), type: 'object' });
  });

  it('should set different $id field for schema having same name', () => {
    function getClass() {
      @Schema()
      /* eslint-disable-next-line @typescript-eslint/no-extraneous-class */
      class Sample {}
      return Sample;
    }

    const ClassOne = getClass();
    const ClassTwo = getClass();
    const classOneOptions = Reflect.getMetadata(SCHEMA_OPTIONS_METADATA, ClassOne);
    const classTwoOptions = Reflect.getMetadata(SCHEMA_OPTIONS_METADATA, ClassTwo);
    expect(classOneOptions.$id).not.toBe(classTwoOptions.$id);
  });
});
