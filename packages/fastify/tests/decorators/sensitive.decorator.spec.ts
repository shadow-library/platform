/**
 * Importing npm packages
 */
import { describe, expect, it } from '@jest/globals';
import { ClassSchema, Field, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */
import { Sensitive } from '@shadow-library/fastify';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('@Sensitive', () => {
  it('should add sensitive metadata to a field', () => {
    @Schema()
    class TestClass {
      @Field()
      @Sensitive()
      sensitiveField: string;
    }

    const schema = ClassSchema.generate(TestClass);

    expect(schema).toEqual({
      $id: expect.any(String),
      type: 'object',
      required: ['sensitiveField'],
      properties: {
        sensitiveField: {
          type: 'string',
          'x-fastify': { sensitive: true },
        },
      },
    });
  });

  it('should add sensitive metadata to multiple fields', () => {
    @Schema()
    class TestClass {
      @Field()
      @Sensitive()
      password: string;

      @Field()
      @Sensitive()
      apiKey: string;

      @Field()
      regularField: string;
    }

    const schema = ClassSchema.generate(TestClass);

    expect(schema).toEqual({
      $id: expect.any(String),
      type: 'object',
      required: ['password', 'apiKey', 'regularField'],
      properties: {
        password: {
          type: 'string',
          'x-fastify': { sensitive: true },
        },
        apiKey: {
          type: 'string',
          'x-fastify': { sensitive: true },
        },
        regularField: {
          type: 'string',
        },
      },
    });
  });

  it('should not add sensitive metadata if not specified', () => {
    @Schema()
    class TestClass {
      @Field()
      regularField: string;
    }

    const schema = ClassSchema.generate(TestClass);

    expect(schema).toEqual({
      $id: expect.any(String),
      type: 'object',
      required: ['regularField'],
      properties: {
        regularField: {
          type: 'string',
        },
      },
    });
  });
});
