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
          'x-fastify': { sensitive: true, type: 'secret' },
        },
      },
    });
  });

  it('should add sensitive email metadata to a field', () => {
    @Schema()
    class TestClass {
      @Field()
      @Sensitive('email')
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
          'x-fastify': { sensitive: true, type: 'email' },
        },
      },
    });
  });

  it('should add sensitive mask options metadata to a field', () => {
    @Schema()
    class TestClass {
      @Field()
      @Sensitive({ keepEnd: 3, keepStart: 2, maskChar: 'x', minMask: 5, preserveSeparators: true })
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
          'x-fastify': { sensitive: true, maskOptions: { keepEnd: 3, keepStart: 2, maskChar: 'x', minMask: 5, preserveSeparators: true } },
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
      @Sensitive('email')
      email: string;

      @Field()
      regularField: string;
    }

    const schema = ClassSchema.generate(TestClass);

    expect(schema).toEqual({
      $id: expect.any(String),
      type: 'object',
      required: ['password', 'email', 'regularField'],
      properties: {
        password: {
          type: 'string',
          'x-fastify': { sensitive: true, type: 'secret' },
        },
        email: {
          type: 'string',
          'x-fastify': { sensitive: true, type: 'email' },
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
