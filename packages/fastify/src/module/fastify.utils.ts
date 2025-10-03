/**
 * Importing npm packages
 */
import assert from 'node:assert';

import { JSONSchema } from '@shadow-library/class-schema';
import { ValidationError, throwError, utils } from '@shadow-library/common';
import Ajv, { SchemaObject, ValidateFunction } from 'ajv';
import { FastifyInstance, fastify } from 'fastify';
import { FastifyRouteSchemaDef, FastifySchemaValidationError, FastifyValidationResult, SchemaErrorDataVar } from 'fastify/types/schema';

/**
 * Importing user defined packages
 */
import { ServerError, ServerErrorCode } from '../server.error';
import { FastifyConfig, FastifyModuleOptions } from './fastify-module.interface';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const keywords = ['x-fastify'];
const allowedHttpParts = ['body', 'params', 'querystring'];
const strictValidator = new Ajv({ allErrors: true, useDefaults: true, removeAdditional: true, strict: true, keywords });
const lenientValidator = new Ajv({ allErrors: true, coerceTypes: true, useDefaults: true, removeAdditional: true, strict: true, keywords });
const notFoundError = new ServerError(ServerErrorCode.S002);

export const notFoundHandler = (): never => throwError(notFoundError);

function compileSchema(ajv: Ajv, schema: JSONSchema): ValidateFunction<unknown> {
  if (!schema.$id) return ajv.compile(schema);

  const schemas: JSONSchema[] = [utils.object.omitKeys(schema, ['definitions']), ...Object.values(schema.definitions ?? {})];
  for (const schema of schemas) {
    if (schema.$id && !ajv.getSchema(schema.$id)) ajv.addSchema(schema, schema.$id);
  }

  return ajv.getSchema(schema.$id) as ValidateFunction<unknown>;
}

export function compileValidator(routeSchema: FastifyRouteSchemaDef<SchemaObject>): FastifyValidationResult {
  assert(allowedHttpParts.includes(routeSchema.httpPart as string), `Invalid httpPart: ${routeSchema.httpPart}`);
  if (routeSchema.httpPart !== 'querystring') return compileSchema(strictValidator, routeSchema.schema);

  const validate = compileSchema(lenientValidator, routeSchema.schema);
  return (data: Record<string, unknown>) => {
    validate(data);

    for (const error of validate.errors ?? []) {
      /** Since this schema is for querystring there won't be any nested objects so we are directly accessing the path */
      const path = error.instancePath.substring(1);
      const defaultValue = routeSchema.schema.properties?.[path]?.default;
      if (defaultValue !== undefined) data[path] = defaultValue;
      else delete data[path]; // eslint-disable-line @typescript-eslint/no-dynamic-delete
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
  const instance = fastify(options);

  instance.setSchemaErrorFormatter(formatSchemaErrors);
  instance.setNotFoundHandler(notFoundHandler);
  instance.setErrorHandler(errorHandler.handle.bind(errorHandler));
  instance.setValidatorCompiler(compileValidator);

  return fastifyFactory ? await fastifyFactory(instance) : instance;
}
