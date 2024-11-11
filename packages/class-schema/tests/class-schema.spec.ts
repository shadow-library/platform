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
  class File {
    @Field()
    name: string;

    @Field()
    size: number;

    // @Field(type => Folder)
    // parent: object;
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

  it('should get the JSON schema for primitive types', () => {
    const schema = new ClassSchema(File);
    expect(schema.getJSONSchema()).toEqual({
      $id: 'class-schema:File-0',
      type: 'object',
      definitions: {},
      required: ['name', 'size'],
      properties: { name: { type: 'string' }, size: { type: 'number' } },
    });
  });

  it('should return the id of the schema', () => {
    const schema = new ClassSchema(File);
    expect(schema.getId()).toEqual('class-schema:File-0');
  });

  it('should get the JSON schema for complex types', () => {
    const schema = new ClassSchema(Folder);
    expect(schema.getJSONSchema()).toEqual({
      type: 'object',
      $id: 'class-schema:Folder-1',
      definitions: {
        'class-schema:File-0': {
          $id: 'class-schema:File-0',
          type: 'object',
          definitions: {},
          required: ['name', 'size'],
          properties: { name: { type: 'string' }, size: { type: 'number' } },
        },
      },
      properties: {
        name: { type: 'string' },
        files: { type: 'array', items: { $ref: 'class-schema:File-0' } },
        folders: { type: 'array', items: { $ref: 'class-schema:Folder-1' } },
      },
      required: ['name', 'files', 'folders'],
    });
  });
});
