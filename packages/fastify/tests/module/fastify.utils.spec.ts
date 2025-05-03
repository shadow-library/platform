/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ValidationError } from '@shadow-library/common';
import { FastifyInstance } from 'fastify';

/**
 * Importing user defined packages
 */
import { compileValidator, createFastifyInstance, formatSchemaErrors, notFoundHandler } from '@lib/module/fastify.utils';
import { ServerError } from '@shadow-library/fastify';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

jest.mock('fastify', () => ({
  fastify: jest.fn().mockReturnValue({
    setNotFoundHandler: jest.fn(),
    setErrorHandler: jest.fn(),
    setSchemaErrorFormatter: jest.fn(),
    setValidatorCompiler: jest.fn(),

    getDefaultJsonParser: jest.fn(),
    addContentTypeParser: jest.fn(),
    addHook: jest.fn(),

    route: jest.fn(),
    listen: jest.fn(),
    close: jest.fn(),
  }),
}));

describe('Create Fastify Instance', () => {
  let instance: FastifyInstance;
  const fastifyFactory = jest.fn((instance: FastifyInstance) => instance);
  const errorHandler = { handle: jest.fn() };
  const schema = {
    type: 'object',
    properties: {
      orderBy: { type: 'string', enum: ['name', 'createdAt'] },
      active: { type: 'boolean' },
      limit: { type: 'number', default: 20, minimum: 1 },
      offset: { type: 'number', default: 0, minimum: 0 },
      order: { type: 'string', default: 'asc', enum: ['asc', 'desc'] },
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    instance = await createFastifyInstance({ host: '', port: 3000, errorHandler }, fastifyFactory);
  });

  it('should create the object and fastify instance', async () => {
    expect(instance).toBeDefined();
    expect(instance.setNotFoundHandler).toHaveBeenCalled();
    expect(instance.setErrorHandler).toHaveBeenCalled();
    expect(instance.setSchemaErrorFormatter).toHaveBeenCalled();
    expect(fastifyFactory).toHaveBeenCalled();
  });

  it('should create the object and fastify instance without fastifyFactory', async () => {
    instance = await createFastifyInstance({ host: '', port: 3000, errorHandler });
    expect(instance).toBeDefined();
    expect(instance.setNotFoundHandler).toHaveBeenCalled();
    expect(instance.setErrorHandler).toHaveBeenCalled();
    expect(instance.setSchemaErrorFormatter).toHaveBeenCalled();
  });

  it('should handle not found error', () => {
    expect(() => notFoundHandler()).toThrow(ServerError);
  });

  it('should format the schema errors', () => {
    const errors = [
      { instancePath: '', message: "must have required property 'password'", keyword: 'required', params: { missingProperty: 'rand' } },
      { instancePath: '/email', params: {} },
      { instancePath: '/gender', message: 'must be one of', keyword: 'enum', params: { allowedValues: ['Male', 'Female'] } },
    ];
    const formattedError = formatSchemaErrors(errors as any, 'body');

    expect(formattedError).toBeInstanceOf(ValidationError);
    expect(formattedError.getErrors()).toStrictEqual([
      { field: 'body', msg: `must have required property 'password'` },
      { field: 'body.email', msg: 'Field validation failed' },
      { field: 'body.gender', msg: 'must be one of: Male, Female' },
    ]);
  });

  it('should validate query schema and transform it to valid data without throwing errors for invalid data', () => {
    const validate = compileValidator({ schema, method: 'get', url: '/test', httpPart: 'querystring' });
    const result = validate({ orderBy: 'rand', active: 'false', limit: '-10', offset: '20', order: 'asc' });
    expect(result).toStrictEqual({ value: { active: false, limit: 20, offset: 20, order: 'asc' } });
  });

  it('should validate query schema and return same data for valid data', () => {
    const validate = compileValidator({ schema, method: 'get', url: '/test', httpPart: 'querystring' });
    const result = validate({ orderBy: 'name', active: true, limit: 10, offset: 20, order: 'asc' });
    expect(result).toStrictEqual({ value: { orderBy: 'name', active: true, limit: 10, offset: 20, order: 'asc' } });
  });

  it('should throw error for body schema validation', () => {
    const validate = compileValidator({ schema, method: 'get', url: '/test', httpPart: 'body' });
    const result = validate({ orderBy: 'rand', active: 'false', limit: '-10', offset: '20', order: 'asc' });
    expect(result).toBe(false);
  });

  it('should throw error for params schema validation', () => {
    const schema = { type: 'object', properties: { id: { type: 'string', pattern: '^[0-9a-f]{12}$' } }, required: ['id'] };
    const validate = compileValidator({ schema, method: 'get', url: '/user/:id', httpPart: 'params' });
    const result = validate({ id: '123' });
    expect(result).toBe(false);
  });
});
