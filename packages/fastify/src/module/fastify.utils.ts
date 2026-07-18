/**
 * Importing npm packages
 */
import assert from 'node:assert';

import Ajv, { Options as AjvOptions, SchemaObject, ValidateFunction } from 'ajv';
import { fastify, FastifyInstance } from 'fastify';
import { FastifyRouteSchemaDef, FastifySchemaValidationError, FastifyValidationResult, SchemaErrorDataVar } from 'fastify/types/schema';
import { JSONSchema } from '@shadow-library/class-schema';
import { utils, ValidationError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { ServerErrorCode } from '../server.error';
import { FastifyConfig, FastifyModuleOptions } from './fastify-module.interface';

/**
 * Defining types
 */

export interface AjvValidators {
  strictValidator: Ajv;
  lenientValidator: Ajv;
}

/**
 * Declaring the constants
 */
const keywords = ['x-fastify'];
const allowedHttpParts = ['body', 'params', 'querystring'];
const defaultAjvOptions: AjvOptions = { allErrors: true, useDefaults: true, removeAdditional: true, strict: true, keywords };

export const notFoundHandler = (): never => ServerErrorCode.S002.throw();

function compileSchema(ajv: Ajv, schema: JSONSchema): ValidateFunction<unknown> {
  if (!schema.$id) return ajv.compile(schema);

  const schemas: JSONSchema[] = [utils.object.omitKeys(schema, ['definitions']), ...Object.values(schema.definitions ?? {})];
  for (const schema of schemas) {
    if (schema.$id && !ajv.getSchema(schema.$id)) ajv.addSchema(schema, schema.$id);
  }

  return ajv.getSchema(schema.$id) as ValidateFunction<unknown>;
}

export function compileValidator(routeSchema: FastifyRouteSchemaDef<SchemaObject>, validators: AjvValidators): FastifyValidationResult {
  assert(allowedHttpParts.includes(routeSchema.httpPart as string), `Invalid httpPart: ${routeSchema.httpPart}`);
  if (routeSchema.httpPart === 'body') return compileSchema(validators.strictValidator, routeSchema.schema);
  if (routeSchema.httpPart === 'params') return compileSchema(validators.lenientValidator, routeSchema.schema);

  const validate = compileSchema(validators.lenientValidator, routeSchema.schema);
  return (data: Record<string, unknown>) => {
    validate(data);

    for (const error of validate.errors ?? []) {
      /** Since this schema is for querystring there won't be any nested objects so we are directly accessing the path */
      const path = error.instancePath.substring(1);
      const defaultValue = routeSchema.schema.properties?.[path]?.default;
      if (defaultValue !== undefined) data[path] = defaultValue;
      else delete data[path];
    }

    return { value: data };
  };
}

export function formatSchemaErrors(errors: FastifySchemaValidationError[], dataVar: SchemaErrorDataVar): ValidationError {
  const validationError = new ValidationError();
  for (const error of errors) {
    let key = dataVar;
    let message = error.message ?? 'Field validation failed';
    if (error.instancePath) key += error.instancePath.replaceAll('/', '.');
    if (Array.isArray(error.params.allowedValues)) message += `: ${error.params.allowedValues.join(', ')}`;
    validationError.addFieldError(key, message);
  }
  return validationError;
}

export async function createFastifyInstance(config: FastifyConfig, fastifyFactory?: FastifyModuleOptions['fastifyFactory']): Promise<FastifyInstance> {
  const options = utils.object.omitKeys(config, ['port', 'host', 'errorHandler', 'responseSchema']);
  const { errorHandler } = config;

  const strictValidator = new Ajv({ ...defaultAjvOptions, ...config.ajv?.customOptions });
  const lenientValidator = new Ajv({ ...defaultAjvOptions, coerceTypes: true, ...config.ajv?.customOptions });
  for (let plugin of config.ajv?.plugins ?? []) {
    if (typeof plugin === 'function') plugin = [plugin, {}];
    const [ajvPlugin, options] = plugin;
    ajvPlugin(strictValidator, options);
    ajvPlugin(lenientValidator, options);
  }

  const instance = fastify(options);
  instance.setSchemaErrorFormatter(formatSchemaErrors);
  instance.setNotFoundHandler(notFoundHandler);
  instance.setValidatorCompiler(routeSchema => compileValidator(routeSchema, { strictValidator, lenientValidator }));
  if (errorHandler) instance.setErrorHandler(errorHandler.handle.bind(errorHandler));

  return fastifyFactory ? await fastifyFactory(instance) : instance;
}
