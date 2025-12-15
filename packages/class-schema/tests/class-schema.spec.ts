/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

import { Class } from 'type-fest';

/**
 * Importing user defined packages
 */
import { BRAND } from '@lib/constants';
import { ClassSchema, Field, Integer, Schema } from '@shadow-library/class-schema';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('ClassSchema', () => {
  @Schema({ $id: Sample.name })
  class Sample {}

  @Schema({ $id: Primitive.name })
  class Primitive {
    @Field()
    str: string;

    @Field()
    num: number;

    @Field()
    bool: boolean;

    @Field()
    obj: object;

    @Field()
    arr: object[];
  }

  @Schema({ $id: Complex.name })
  class Complex {
    @Field({ format: 'email' })
    email: string;

    @Field(() => String, { format: 'date-time', nullable: true })
    date = '2000-01-01T00:00:00Z';

    @Field(() => Integer, { minimum: 18 })
    age: number;

    @Field(() => Sample)
    primitive: Sample;

    @Field(() => [Primitive])
    primitives: Primitive[] = [];
  }

  @Schema({ $id: AdditionalProperties.name, additionalProperties: String })
  class AdditionalProperties {
    [key: string]: string;
  }

  @Schema({ $id: PatternProperties.name, patternProperties: { '^[a-zA-Z]{3,32}$': Boolean } })
  class PatternProperties {
    [key: string]: boolean;
  }

  @Schema({ $id: ExtendedPrimitive.name, title: 'ExtendedPrimitiveTitle' })
  class ExtendedPrimitive extends Primitive {
    @Field()
    extended: AdditionalProperties;

    @Field()
    patternProperties: PatternProperties;
  }

  @Schema({ $id: File.name })
  class File {
    @Field()
    name: string;

    @Field({ optional: true })
    size?: number;

    @Field(() => Folder)
    parent: object;

    @Field({ requiredIf: 'size' })
    unit: string;
  }

  @Schema({ $id: Folder.name })
  class Folder {
    @Field()
    name: string;

    @Field(() => [File])
    files: File;

    @Field(() => [Folder])
    folders: Folder;
  }

  describe('isBranded', () => {
    it('should return true for branded schema', () => {
      const schema = new ClassSchema(Sample).getJSONSchema();
      expect(ClassSchema.isBranded(schema)).toBe(true);
    });

    it('should return true for branded array schema', () => {
      const schema = new ClassSchema([Sample]).getJSONSchema();
      expect(ClassSchema.isBranded(schema)).toBe(true);
    });

    it('should return true for branded clone schema', () => {
      const schema = new ClassSchema(Sample).getJSONSchema(true);
      expect(ClassSchema.isBranded(schema)).toBe(true);
    });

    it('should return false for non-branded schema', () => {
      expect(ClassSchema.isBranded({ type: 'object' })).toBe(false);
    });
  });

  describe('generate', () => {
    it('should return the json schema of the class', () => {
      expect(ClassSchema.generate(Primitive)).toStrictEqual({
        $id: Primitive.name,
        type: 'object',
        required: ['str', 'num', 'bool', 'obj', 'arr'],
        properties: {
          str: { type: 'string' },
          num: { type: 'number' },
          bool: { type: 'boolean' },
          obj: { type: 'object' },
          arr: { type: 'array' },
        },
      });
    });

    [String, Number, Boolean, Object, Array].forEach(type => {
      it(`should return the JSON schema for primitive type '${type.name}'`, () => {
        expect(ClassSchema.generate(type)).toStrictEqual({ $id: type.name, type: type.name.toLowerCase() as any });
      });
    });
  });

  it('should return the id of the schema', () => {
    const schema = new ClassSchema(Sample);
    expect(schema.getId()).toEqual(Sample.name);
  });

  it('should get the JSON schema for primitive types', () => {
    const schema = new ClassSchema(Primitive);
    expect(schema.getJSONSchema()).toStrictEqual({
      $id: Primitive.name,
      type: 'object',
      required: ['str', 'num', 'bool', 'obj', 'arr'],
      properties: {
        str: { type: 'string' },
        num: { type: 'number' },
        bool: { type: 'boolean' },
        obj: { type: 'object' },
        arr: { type: 'array' },
      },
    });
  });

  it('should get the JSON schema for inherited classes', () => {
    const schema = new ClassSchema(ExtendedPrimitive);
    expect(schema.getJSONSchema()).toStrictEqual({
      $id: ExtendedPrimitive.name,
      title: 'ExtendedPrimitiveTitle',
      type: 'object',
      required: ['str', 'num', 'bool', 'obj', 'arr', 'extended', 'patternProperties'],
      properties: {
        str: { type: 'string' },
        num: { type: 'number' },
        bool: { type: 'boolean' },
        obj: { type: 'object' },
        arr: { type: 'array' },
        extended: { $ref: AdditionalProperties.name },
        patternProperties: { $ref: PatternProperties.name },
      },
      definitions: {
        [AdditionalProperties.name]: {
          $id: AdditionalProperties.name,
          type: 'object',
          additionalProperties: { type: 'string' },
        },
        [PatternProperties.name]: {
          $id: PatternProperties.name,
          type: 'object',
          patternProperties: { '^[a-zA-Z]{3,32}$': { type: 'boolean' } },
        },
      },
    });
  });

  it('should get the JSON schema for complex types', () => {
    const schema = new ClassSchema(Complex);
    expect(schema.getJSONSchema()).toStrictEqual({
      $id: Complex.name,
      type: 'object',
      definitions: {
        [Primitive.name]: {
          $id: Primitive.name,
          type: 'object',
          required: ['str', 'num', 'bool', 'obj', 'arr'],
          properties: {
            str: { type: 'string' },
            num: { type: 'number' },
            bool: { type: 'boolean' },
            obj: { type: 'object' },
            arr: { type: 'array' },
          },
        },
        [Sample.name]: {
          $id: Sample.name,
          type: 'object',
        },
      },
      required: ['email', 'date', 'age', 'primitive', 'primitives'],
      properties: {
        email: { type: 'string', format: 'email' },
        date: { type: ['string', 'null'], format: 'date-time', default: '2000-01-01T00:00:00Z' },
        age: { type: 'integer', minimum: 18 },
        primitive: { $ref: Sample.name },
        primitives: { type: 'array', items: { $ref: Primitive.name }, default: [] },
      },
    });
  });

  it('should get the JSON schema for circular types', () => {
    const schema = new ClassSchema(File);
    expect(schema.getJSONSchema()).toStrictEqual({
      $id: File.name,
      type: 'object',
      definitions: {
        [Folder.name]: {
          type: 'object',
          $id: Folder.name,
          properties: {
            name: { type: 'string' },
            files: { type: 'array', items: { $ref: File.name } },
            folders: { type: 'array', items: { $ref: Folder.name } },
          },
          required: ['name', 'files', 'folders'],
        },
      },
      required: ['name', 'parent'],
      properties: {
        name: { type: 'string' },
        size: { type: 'number' },
        parent: { $ref: Folder.name },
        unit: { type: 'string' },
      },
      dependencies: { size: ['unit'] },
    });
  });

  it('should get the JSON schema for array of object', () => {
    const schema = new ClassSchema([Sample]);
    expect(schema.getJSONSchema()).toStrictEqual({
      $id: `${Sample.name}?type=Array`,
      definitions: {
        Sample: { $id: 'Sample', type: 'object' },
      },
      type: 'array',
      items: { $ref: Sample.name },
    });
  });

  it('should add the dependencies to set for a schema', () => {
    const dependencies = new Set<Class<unknown>>();
    new ClassSchema(File, { dependencies });
    expect(dependencies.size).toBe(1);
    expect(dependencies.has(Folder)).toBe(true);
  });

  it('should return the schema for only the class members', () => {
    const schema = new ClassSchema(File, { shallow: true });
    expect(schema.getJSONSchema()).toStrictEqual({
      $id: File.name,
      type: 'object',
      required: ['name', 'parent'],
      properties: {
        name: { type: 'string' },
        size: { type: 'number' },
        parent: { $ref: Folder.name },
        unit: { type: 'string' },
      },
      dependencies: { size: ['unit'] },
    });
  });

  it('should brand the original json schema', () => {
    const schema = new ClassSchema(File).getJSONSchema();
    expect((schema as any)[BRAND]).toBe(true);
  });

  it('should brand the cloned json schema', () => {
    const schema = new ClassSchema(File).getJSONSchema(true);
    expect((schema as any)[BRAND]).toBe(true);
  });
});
