/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it, jest, mock } from 'bun:test';
import Ajv from 'ajv';
import { FastifyInstance } from 'fastify';
import { AppError, ValidationError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { type AjvValidators } from '@lib/module/fastify.utils';
import { type JSONSchema } from '@shadow-library/class-schema';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const fastifyModule = await import('fastify');
const instanceStub = {
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
};
const fastify = jest.fn(() => instanceStub);
mock.module('fastify', () => ({ ...fastifyModule, fastify, default: fastify }));
const { compileValidator, createFastifyInstance, formatSchemaErrors, notFoundHandler } = await import('@lib/module/fastify.utils');

describe('Create Fastify Instance', () => {
  let instance: FastifyInstance;
  const fastifyFactory = jest.fn((instance: FastifyInstance) => instance);
  const errorHandler = { handle: jest.fn() };
  const defaultAjvOptions = { allErrors: true, useDefaults: true, removeAdditional: true, strict: true, keywords: ['x-fastify', 'errorMessage'] };
  const validators: AjvValidators = {
    strictValidator: new Ajv({ ...defaultAjvOptions }),
    lenientValidator: new Ajv({ ...defaultAjvOptions, coerceTypes: true }),
  };
  const schema = {
    $id: 'TestSchema',
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
    instance = (await createFastifyInstance({ host: '', port: 3000, errorHandler }, fastifyFactory)) as unknown as FastifyInstance;
  });

  it('should create the object and fastify instance', async () => {
    expect(instance).toBeDefined();
    expect(instance.setNotFoundHandler).toHaveBeenCalled();
    expect(instance.setErrorHandler).toHaveBeenCalled();
    expect(instance.setSchemaErrorFormatter).toHaveBeenCalled();
    expect(fastifyFactory).toHaveBeenCalled();
  });

  it('should forward trustProxy to the fastify instance', async () => {
    await createFastifyInstance({ host: '', port: 3000, errorHandler, trustProxy: true });
    expect(fastify).toHaveBeenCalledWith(expect.objectContaining({ trustProxy: true }));
  });

  it('should create the object and fastify instance without fastifyFactory', async () => {
    instance = (await createFastifyInstance({ host: '', port: 3000, errorHandler })) as unknown as FastifyInstance;
    expect(instance).toBeDefined();
    expect(instance.setNotFoundHandler).toHaveBeenCalled();
    expect(instance.setErrorHandler).toHaveBeenCalled();
    expect(instance.setSchemaErrorFormatter).toHaveBeenCalled();
  });

  it('should handle not found error', () => {
    expect(() => notFoundHandler()).toThrow(AppError);
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
      { field: 'body.rand', msg: `must have required property 'password'` },
      { field: 'body.email', msg: 'Field validation failed' },
      { field: 'body.gender', msg: 'must be one of: Male, Female' },
    ]);
  });

  describe('errorMessage', () => {
    /** Mirrors a generated schema: the root carries the fields, referenced classes live in `definitions` keyed by `$id` */
    const rootSchema: JSONSchema = {
      $id: 'class-schema:Register-1',
      type: 'object',
      properties: {
        password: { type: 'string', minLength: 8, errorMessage: 'Password is too weak' },
        gender: { type: 'string', enum: ['male', 'female'], errorMessage: 'Choose a valid gender' },
        code: { type: 'string', errorMessage: { minLength: 'Too short', pattern: 'Needs a digit', _: 'Invalid code' } },
        note: { type: 'string', errorMessage: { minLength: 'Too short' } },
        nickname: { type: 'string', minLength: 2 },
        tags: { type: 'array', items: { type: 'string', minLength: 2, errorMessage: 'Tag is too short' } },
        address: { $ref: 'class-schema:Address-0' },
      },
      definitions: {
        'class-schema:Address-0': {
          $id: 'class-schema:Address-0',
          type: 'object',
          properties: { street: { type: 'string', minLength: 3, errorMessage: { minLength: 'Enter a valid street', required: 'Street is required' } } },
        },
      },
    };
    const format = (errors: object[]): ValidationError => formatSchemaErrors(errors as any, 'body', rootSchema);

    it('should return the field errorMessage instead of the ajv message', () => {
      const errors = [
        { instancePath: '/password', message: 'must NOT have fewer than 8 characters', keyword: 'minLength', params: { limit: 8 }, schemaPath: '#/properties/password/minLength' },
      ];
      expect(format(errors).getErrors()).toStrictEqual([{ field: 'body.password', msg: 'Password is too weak' }]);
    });

    it('should pick the message matching the failing keyword', () => {
      const errors = [
        { instancePath: '/code', keyword: 'minLength', params: {}, schemaPath: '#/properties/code/minLength' },
        { instancePath: '/code', keyword: 'pattern', params: {}, schemaPath: '#/properties/code/pattern' },
      ];
      expect(format(errors).getErrors()).toStrictEqual([
        { field: 'body.code', msg: 'Too short' },
        { field: 'body.code', msg: 'Needs a digit' },
      ]);
    });

    it('should fall back to the catch all message when the keyword has no entry', () => {
      const errors = [{ instancePath: '/code', keyword: 'format', params: {}, schemaPath: '#/properties/code/format' }];
      expect(format(errors).getErrors()).toStrictEqual([{ field: 'body.code', msg: 'Invalid code' }]);
    });

    it('should fall back to the ajv message when the keyword has no entry and no catch all', () => {
      const errors = [{ instancePath: '/note', message: 'must match pattern', keyword: 'pattern', params: {}, schemaPath: '#/properties/note/pattern' }];
      expect(format(errors).getErrors()).toStrictEqual([{ field: 'body.note', msg: 'must match pattern' }]);
    });

    it('should fall back to the ajv message for a field without an errorMessage', () => {
      const errors = [
        { instancePath: '/nickname', message: 'must NOT have fewer than 2 characters', keyword: 'minLength', params: {}, schemaPath: '#/properties/nickname/minLength' },
      ];
      expect(format(errors).getErrors()).toStrictEqual([{ field: 'body.nickname', msg: 'must NOT have fewer than 2 characters' }]);
    });

    it('should interpolate the keyword specific params into the errorMessage', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          gender: { errorMessage: 'Expected one of {allowedValues}' },
          code: { errorMessage: 'Must match {pattern}' },
          name: { errorMessage: 'Unresolved {nope} stays' },
        },
      };
      const errors = [
        { instancePath: '/gender', keyword: 'enum', params: { allowedValues: ['male', 'female'] }, schemaPath: '#/properties/gender/enum' },
        { instancePath: '/code', keyword: 'pattern', params: { pattern: '^\\d+$' }, schemaPath: '#/properties/code/pattern' },
        { instancePath: '/name', keyword: 'minLength', params: { limit: 3 }, schemaPath: '#/properties/name/minLength' },
      ];
      expect(formatSchemaErrors(errors as any, 'body', schema).getErrors()).toStrictEqual([
        { field: 'body.gender', msg: 'Expected one of male,female' },
        { field: 'body.code', msg: 'Must match ^\\d+$' },
        { field: 'body.name', msg: 'Unresolved {nope} stays' },
      ]);
    });

    it('should suppress the allowed values suffix when a custom message is present', () => {
      const errors = [
        { instancePath: '/gender', message: 'must be one of', keyword: 'enum', params: { allowedValues: ['male', 'female'] }, schemaPath: '#/properties/gender/enum' },
      ];
      expect(format(errors).getErrors()).toStrictEqual([{ field: 'body.gender', msg: 'Choose a valid gender' }]);
    });

    it('should resolve the message off the missing property for a required error', () => {
      const errors = [
        { instancePath: '', message: `must have required property 'password'`, keyword: 'required', params: { missingProperty: 'password' }, schemaPath: '#/required' },
      ];
      expect(format(errors).getErrors()).toStrictEqual([{ field: 'body.password', msg: 'Password is too weak' }]);
    });

    it('should resolve the message of an inline array item', () => {
      const errors = [{ instancePath: '/tags/0', keyword: 'minLength', params: { limit: 2 }, schemaPath: '#/properties/tags/items/minLength' }];
      expect(format(errors).getErrors()).toStrictEqual([{ field: 'body.tags.0', msg: 'Tag is too short' }]);
    });

    it('should resolve the message declared inside a referenced definition', () => {
      const errors = [{ instancePath: '/address/street', keyword: 'minLength', params: { limit: 3 }, schemaPath: 'class-schema:Address-0/properties/street/minLength' }];
      expect(format(errors).getErrors()).toStrictEqual([{ field: 'body.address.street', msg: 'Enter a valid street' }]);
    });

    it('should resolve a required error raised inside a referenced definition', () => {
      const errors = [
        {
          instancePath: '/address',
          message: 'must have required property',
          keyword: 'required',
          params: { missingProperty: 'street' },
          schemaPath: 'class-schema:Address-0/required',
        },
      ];
      expect(format(errors).getErrors()).toStrictEqual([{ field: 'body.address.street', msg: 'Street is required' }]);
    });

    it('should resolve a definition whose $id contains a slash', () => {
      const schema: JSONSchema = {
        type: 'object',
        definitions: {
          'https://schemas.dev/address': { type: 'object', properties: { city: { type: 'string', errorMessage: 'Enter a valid city' } } },
        },
      };
      const errors = [{ instancePath: '/address/city', keyword: 'minLength', params: {}, schemaPath: 'https://schemas.dev/address/properties/city/minLength' }];
      expect(formatSchemaErrors(errors as any, 'body', schema).getErrors()).toStrictEqual([{ field: 'body.address.city', msg: 'Enter a valid city' }]);
    });

    it('should fall back to the ajv message when no schema is given to resolve against', () => {
      const errors = [{ instancePath: '/password', message: 'ajv message', keyword: 'minLength', params: {}, schemaPath: '#/properties/password/minLength' }];
      expect(formatSchemaErrors(errors as any, 'body').getErrors()).toStrictEqual([{ field: 'body.password', msg: 'ajv message' }]);
    });

    it('should fall back to the ajv message when the schema path does not resolve', () => {
      const errors = [
        { instancePath: '/ghost', message: 'ajv message', keyword: 'minLength', params: {}, schemaPath: '#/properties/ghost/minLength' },
        { instancePath: '/password', message: 'ajv message', keyword: 'minLength', params: {}, schemaPath: 'class-schema:Unknown-9/properties/password/minLength' },
        { instancePath: '/password', message: 'ajv message', keyword: 'minLength', params: {}, schemaPath: 'properties/password/minLength' },
      ];
      expect(format(errors).getErrors()).toStrictEqual([
        { field: 'body.ghost', msg: 'ajv message' },
        { field: 'body.password', msg: 'ajv message' },
        { field: 'body.password', msg: 'ajv message' },
      ]);
    });

    it('should not expose the rule params to the client', () => {
      const schema: JSONSchema = { type: 'object', properties: { password: { errorMessage: 'Must be at least {limit} characters' } } };
      const errors = [{ instancePath: '/password', keyword: 'minLength', params: { limit: 8 }, schemaPath: '#/properties/password/minLength' }];
      expect(formatSchemaErrors(errors as any, 'body', schema).toResponse().fields).toStrictEqual([{ field: 'body.password', msg: 'Must be at least 8 characters' }]);
    });

    /**
     * Messages are resolved from `schemaPath` so that `verbose` stays off; enabling it would attach the submitted values
     * to every error object, which are then retained on the long lived compiled validator until the next failure.
     */
    describe('independence from the ajv verbose option', () => {
      const schema = {
        $id: 'VerboseSchema',
        type: 'object',
        properties: { street: { $ref: 'VerboseStreet' }, password: { type: 'string', minLength: 8, errorMessage: 'Password is too weak' } },
        required: ['password'],
        definitions: { VerboseStreet: { $id: 'VerboseStreet', type: 'object', properties: { name: { type: 'string', minLength: 3, errorMessage: 'Enter a valid street' } } } },
      };

      it.each([false, true])('should resolve messages with verbose set to %s', verbose => {
        const options = { ...defaultAjvOptions, verbose };
        const scoped: AjvValidators = { strictValidator: new Ajv(options), lenientValidator: new Ajv({ ...options, coerceTypes: true }) };
        const validate = compileValidator({ schema: { ...schema, $id: `VerboseSchema-${verbose}` }, method: 'post', url: '/verbose', httpPart: 'body' }, scoped);

        const result = validate({ password: 'short', street: { name: 'Ma' } }) as { error: ValidationError };
        expect(result.error.getErrors()).toStrictEqual([
          { field: 'body.street.name', msg: 'Enter a valid street' },
          { field: 'body.password', msg: 'Password is too weak' },
        ]);
      });

      it('should keep the submitted values off the ajv errors, which verbose would not', () => {
        const target = { type: 'object', properties: { password: { type: 'string', minLength: 50 } } };
        const errorsFor = (verbose: boolean): string => {
          const validate = new Ajv({ ...defaultAjvOptions, verbose }).compile(target);
          validate({ password: 'sensitive-value' });
          return JSON.stringify(validate.errors);
        };

        expect(errorsFor(false)).not.toContain('sensitive-value');
        expect(errorsFor(true)).toContain('sensitive-value');
      });
    });
  });

  it('should validate query schema and transform it to valid data without throwing errors for invalid data', () => {
    const validate = compileValidator({ schema, method: 'get', url: '/test', httpPart: 'querystring' }, validators);
    const result = validate({ orderBy: 'rand', active: 'false', limit: '-10', offset: '20', order: 'asc' });
    expect(result).toStrictEqual({ value: { active: false, limit: 20, offset: 20, order: 'asc' } });
  });

  it('should validate query schema and return same data for valid data', () => {
    const validate = compileValidator({ schema, method: 'get', url: '/test', httpPart: 'querystring' }, validators);
    const result = validate({ orderBy: 'name', active: true, limit: 10, offset: 20, order: 'asc' });
    expect(result).toStrictEqual({ value: { orderBy: 'name', active: true, limit: 10, offset: 20, order: 'asc' } });
  });

  it('should return a validation error for body schema validation', () => {
    const validate = compileValidator({ schema, method: 'get', url: '/test', httpPart: 'body' }, validators);
    const result = validate({ orderBy: 'rand', active: 'false', limit: '-10', offset: '20', order: 'asc' }) as { error: ValidationError };
    expect(result.error).toBeInstanceOf(ValidationError);
    expect(result.error.getErrors().map(error => error.field)).toStrictEqual(['body.orderBy', 'body.active', 'body.limit', 'body.offset']);
  });

  it('should return an empty result for valid body schema validation', () => {
    const validate = compileValidator({ schema, method: 'get', url: '/test', httpPart: 'body' }, validators);
    expect(validate({ orderBy: 'name', active: true, limit: 10, offset: 20, order: 'asc' })).toStrictEqual({});
  });

  it('should return a validation error for params schema validation', () => {
    const schema = { type: 'object', properties: { id: { type: 'string', pattern: '^[0-9a-f]{12}$', errorMessage: 'Invalid user id' } }, required: ['id'] };
    const validate = compileValidator({ schema, method: 'get', url: '/user/:id', httpPart: 'params' }, validators);
    const result = validate({ id: '123' }) as { error: ValidationError };
    expect(result.error).toBeInstanceOf(ValidationError);
    expect(result.error.getErrors()).toStrictEqual([{ field: 'params.id', msg: 'Invalid user id' }]);
  });

  it('should apply custom ajv options when config.ajv.customOptions is provided', async () => {
    const customOptions = { verbose: true };
    instance = (await createFastifyInstance({ host: '', port: 3000, errorHandler, ajv: { customOptions } })) as unknown as FastifyInstance;
    expect(instance).toBeDefined();
    expect(instance.setValidatorCompiler).toHaveBeenCalled();
  });

  it('should apply ajv plugins when config.ajv.plugins is provided', async () => {
    const mockPlugin = jest.fn();
    const pluginOptions = { testOption: true };
    instance = (await createFastifyInstance({ host: '', port: 3000, errorHandler, ajv: { plugins: [[mockPlugin, pluginOptions], mockPlugin] } })) as unknown as FastifyInstance;
    expect(instance).toBeDefined();
    expect(mockPlugin).toHaveBeenNthCalledWith(1, expect.any(Object), pluginOptions);
    expect(mockPlugin).toHaveBeenNthCalledWith(2, expect.any(Object), pluginOptions);
    expect(mockPlugin).toHaveBeenNthCalledWith(3, expect.any(Object), {});
    expect(mockPlugin).toHaveBeenNthCalledWith(4, expect.any(Object), {});
  });
});
