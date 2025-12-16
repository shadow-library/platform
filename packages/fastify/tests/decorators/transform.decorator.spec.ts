/**
 * Importing npm packages
 */
import { describe, expect, it } from '@jest/globals';
import { ClassSchema, Field, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */
import { Transform } from '@shadow-library/fastify';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('@Transform', () => {
  it('should add transform metadata to a field', () => {
    @Schema()
    class TestClass {
      @Field()
      @Transform('string:trim')
      name: string;
    }

    const schema = ClassSchema.generate(TestClass);
    expect(schema).toEqual({
      $id: expect.any(String),
      type: 'object',
      required: ['name'],
      properties: {
        name: {
          type: 'string',
          'x-fastify': { transform: { input: 'string:trim', output: 'string:trim' } },
        },
      },
    });
  });

  it('should add transform metadata with different input and output transformers', () => {
    @Schema()
    class TestClass {
      @Field()
      @Transform({ input: 'string:trim', output: 'email:normalize' })
      email: string;
    }

    const schema = ClassSchema.generate(TestClass);
    expect(schema).toEqual({
      $id: expect.any(String),
      type: 'object',
      required: ['email'],
      properties: {
        email: {
          type: 'string',
          'x-fastify': { transform: { input: 'string:trim', output: 'email:normalize' } },
        },
      },
    });
  });
});
