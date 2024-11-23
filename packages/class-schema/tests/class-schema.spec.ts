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
  @Schema()
  /* eslint-disable @typescript-eslint/no-extraneous-class */
  class Sample {}

  @Schema()
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

  @Schema()
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

  @Schema()
  class File {
    @Field()
    name: string;

    @Field()
    size: number;

    @Field(() => Folder)
    parent: object;
  }

  @Schema()
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
        $id: 'class-schema:Primitive-1',
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
    expect(schema.getId()).toEqual('class-schema:Sample-0');
  });

  it('should get the JSON schema for primitive types', () => {
    const schema = new ClassSchema(Primitive);
    expect(schema.getJSONSchema()).toStrictEqual({
      $id: 'class-schema:Primitive-1',
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

  it('should get the JSON schema for complex types', () => {
    const schema = new ClassSchema(Complex);
    expect(schema.getJSONSchema()).toStrictEqual({
      $id: 'class-schema:Complex-2',
      type: 'object',
      definitions: {
        'class-schema:Primitive-1': {
          $id: 'class-schema:Primitive-1',
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
        'class-schema:Sample-0': {
          $id: 'class-schema:Sample-0',
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
        primitive: { $ref: 'class-schema:Sample-0' },
        primitives: { type: 'array', items: { $ref: 'class-schema:Primitive-1' } },
      },
    });
  });

  it('should get the JSON schema for circular types', () => {
    const schema = new ClassSchema(File);
    expect(schema.getJSONSchema()).toStrictEqual({
      $id: 'class-schema:File-3',
      type: 'object',
      definitions: {
        'class-schema:Folder-4': {
          type: 'object',
          $id: 'class-schema:Folder-4',
          definitions: {},
          properties: {
            name: { type: 'string' },
            files: { type: 'array', items: { $ref: 'class-schema:File-3' } },
            folders: { type: 'array', items: { $ref: 'class-schema:Folder-4' } },
          },
          required: ['name', 'files', 'folders'],
        },
      },
      required: ['name', 'size', 'parent'],
      properties: {
        name: { type: 'string' },
        size: { type: 'number' },
        parent: { $ref: 'class-schema:Folder-4' },
      },
    });
  });
});
