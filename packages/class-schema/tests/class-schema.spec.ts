/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { ClassSchema, Field, Schema } from '@shadow-library/class-schema';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('ClassSchema', () => {
  @Schema({ $id: Sample.name })
  /* eslint-disable @typescript-eslint/no-extraneous-class */
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

    @Field(() => String, { format: 'date-time' })
    date: string;

    @Field(() => Number, { format: 'int32' })
    age: number;

    @Field(() => Sample)
    primitive: Sample;

    @Field(() => [Primitive])
    primitives: Primitive;
  }

  @Schema({ $id: ExtendedPrimitive.name, title: 'ExtendedPrimitiveTitle' })
  class ExtendedPrimitive extends Primitive {
    @Field({ additionalProperties: true })
    extended: Record<string, string>;
  }

  @Schema({ $id: File.name })
  class File {
    @Field()
    name: string;

    @Field()
    size: number;

    @Field(() => Folder)
    parent: object;
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

  describe('generate', () => {
    it('should return ths json schema of the class', () => {
      expect(ClassSchema.generate(Primitive)).toStrictEqual({
        $id: Primitive.name,
        type: 'object',
        definitions: {},
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
      definitions: {},
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
      definitions: {},
      required: ['str', 'num', 'bool', 'obj', 'arr', 'extended'],
      properties: {
        str: { type: 'string' },
        num: { type: 'number' },
        bool: { type: 'boolean' },
        obj: { type: 'object' },
        arr: { type: 'array' },
        extended: { type: 'object', additionalProperties: true },
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
          definitions: {},
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
          definitions: {},
          required: [],
          properties: {},
        },
      },
      required: ['email', 'date', 'age', 'primitive', 'primitives'],
      properties: {
        email: { type: 'string', format: 'email' },
        date: { type: 'string', format: 'date-time' },
        age: { type: 'number', format: 'int32' },
        primitive: { $ref: Sample.name },
        primitives: { type: 'array', items: { $ref: Primitive.name } },
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
          definitions: {},
          properties: {
            name: { type: 'string' },
            files: { type: 'array', items: { $ref: File.name } },
            folders: { type: 'array', items: { $ref: Folder.name } },
          },
          required: ['name', 'files', 'folders'],
        },
      },
      required: ['name', 'size', 'parent'],
      properties: {
        name: { type: 'string' },
        size: { type: 'number' },
        parent: { $ref: Folder.name },
      },
    });
  });
});
