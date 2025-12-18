/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { METADATA_KEYS } from '@lib/constants';
import { Schema } from '@shadow-library/class-schema';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('@Schema', () => {
  it('should decorate the class with schema options', () => {
    @Schema({ $id: 'id', description: 'description' })
    class Sample {}

    const options = Reflect.getMetadata(METADATA_KEYS.SCHEMA_OPTIONS, Sample);
    expect(options).toStrictEqual({ $id: 'id', type: 'object', description: 'description' });
  });

  it('should set the default $id field', () => {
    @Schema()
    class Sample {}

    const options = Reflect.getMetadata(METADATA_KEYS.SCHEMA_OPTIONS, Sample);
    expect(options).toStrictEqual({ $id: expect.stringMatching(/^class-schema:Sample-[0-9]+$/), type: 'object' });
  });

  it('should set different $id field for schema having same name', () => {
    function getClass() {
      @Schema()
      class Sample {}
      return Sample;
    }

    const ClassOne = getClass();
    const ClassTwo = getClass();
    const classOneOptions = Reflect.getMetadata(METADATA_KEYS.SCHEMA_OPTIONS, ClassOne);
    const classTwoOptions = Reflect.getMetadata(METADATA_KEYS.SCHEMA_OPTIONS, ClassTwo);
    expect(classOneOptions.$id).not.toBe(classTwoOptions.$id);
  });

  it('should set the extra properties', () => {
    @Schema({ additionalProperties: true })
    class Sample {}

    const options = Reflect.getMetadata(METADATA_KEYS.SCHEMA_EXTRA_PROPERTIES, Sample);
    expect(options).toStrictEqual({ additionalProperties: true });
  });

  it('should set extra properties with false value', () => {
    @Schema({ additionalProperties: false })
    class Sample {}

    const options = Reflect.getMetadata(METADATA_KEYS.SCHEMA_EXTRA_PROPERTIES, Sample);
    expect(options).toStrictEqual({ additionalProperties: false });
  });
});
