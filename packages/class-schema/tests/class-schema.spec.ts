/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from '@jest/globals';

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
  let classSchema: ClassSchema;

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

  beforeEach(() => {
    classSchema = new ClassSchema();
  });

  it('should get the JSON schema for primitive types', () => {
    const schema = classSchema.getSchema(File);
    expect(schema).toEqual({
      $id: 'class-schema:File-0',
      type: 'object',
      definitions: {},
      required: ['name', 'size'],
      properties: {
        name: { type: 'string' },
        size: { type: 'number' },
      },
    });
  });

  it('should get the JSON schema for complex types', () => {
    const schema = classSchema.getSchema(Folder);
    expect(schema).toEqual({
      type: 'object',
      $id: 'class-schema:Folder-1',
      definitions: {},
      properties: {
        name: { type: 'string' },
        files: { type: 'array', items: { $ref: 'class-schema:File-0' } },
        folders: { type: 'array', items: { $ref: 'class-schema:Folder-1' } },
      },
      required: ['name', 'files', 'folders'],
    });
  });
});
