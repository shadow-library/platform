/**
 * Importing npm packages
 */
import assert from 'node:assert';

import Ajv, { Options as AjvOptions, SchemaObject, ValidateFunction } from 'ajv';
import { fastify, FastifyInstance } from 'fastify';
import { FastifyRouteSchemaDef, FastifySchemaValidationError, FastifyValidationResult, SchemaErrorDataVar } from 'fastify/types/schema';
import { JsonObject } from 'type-fest';
import { JSONSchema } from '@shadow-library/class-schema';
import { MaybeUndefined, utils, ValidationError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { FieldErrorMessage } from '../interfaces';
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
const keywords = ['x-fastify', 'errorMessage'];
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

  if (routeSchema.httpPart !== 'querystring') {
    const ajv = routeSchema.httpPart === 'body' ? validators.strictValidator : validators.lenientValidator;
    const validate = compileSchema(ajv, routeSchema.schema);
    const dataVar = routeSchema.httpPart as SchemaErrorDataVar;

    /**
     * The errors are formatted here rather than by the schema error formatter because resolving a field's
     * `errorMessage` needs the route schema, and because it keeps the raw Ajv errors from leaving this handler.
     */
    return data => {
      if (validate(data)) return {};
      return { error: formatSchemaErrors(validate.errors ?? [], dataVar, routeSchema.schema) };
    };
  }

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

/**
 * Locates the schema that declares the failing keyword. Ajv reports `schemaPath` relative to the root schema as
 * `#/properties/name/minLength`, or relative to the `$id` of the definition holding it as `Address/properties/street/minLength`.
 */
function resolveErrorSchema(schemaPath: string, rootSchema: JSONSchema): MaybeUndefined<JSONSchema> {
  const definitions = rootSchema.definitions ?? {};
  /** Matching the longest `$id` first keeps an id that itself contains a slash from being split at the wrong place */
  const definitionId = Object.keys(definitions)
    .filter(id => schemaPath.startsWith(`${id}/`))
    .sort((idA, idB) => idB.length - idA.length)[0];

  let schema: MaybeUndefined<JSONSchema>;
  let pointer: string;
  if (definitionId) {
    schema = definitions[definitionId];
    pointer = schemaPath.slice(definitionId.length + 1);
  } else if (schemaPath.startsWith('#/')) {
    schema = rootSchema;
    pointer = schemaPath.slice(2);
  } else return undefined;

  /** The trailing segment is the keyword that failed, the ones before it lead to the schema declaring it */
  const segments = pointer.split('/').slice(0, -1);
  for (const segment of segments) {
    schema = schema?.[segment.replaceAll('~1', '/').replaceAll('~0', '~')];
    if (!schema) return undefined;
  }

  return schema;
}

/** Picks the message for the failing keyword, falling back to the `_` catch all */
function resolveFieldErrorMessage(schema: MaybeUndefined<JSONSchema>, keyword: string): MaybeUndefined<string> {
  const errorMessage = schema?.errorMessage as MaybeUndefined<FieldErrorMessage>;
  if (!errorMessage) return undefined;
  if (typeof errorMessage === 'string') return errorMessage;
  return errorMessage[keyword] ?? errorMessage._;
}

export function formatSchemaErrors(errors: FastifySchemaValidationError[], dataVar: SchemaErrorDataVar, rootSchema?: JSONSchema): ValidationError {
  const validationError = new ValidationError();
  for (const error of errors) {
    const { params } = error;
    const missingProperty = params.missingProperty as MaybeUndefined<string>;

    let key = dataVar;
    if (error.instancePath) key += error.instancePath.replaceAll('/', '.');
    /** A missing field is reported against the object holding it, so the field itself has to be appended to the path */
    if (missingProperty) key += `.${missingProperty}`;

    const errorSchema = rootSchema ? resolveErrorSchema(error.schemaPath, rootSchema) : undefined;
    const fieldSchema = missingProperty ? errorSchema?.properties?.[missingProperty] : errorSchema;
    const customMessage = resolveFieldErrorMessage(fieldSchema, error.keyword);
    if (customMessage) {
      validationError.addFieldError(key, customMessage, params as JsonObject);
      continue;
    }

    let message = error.message ?? 'Field validation failed';
    if (Array.isArray(params.allowedValues)) message += `: ${params.allowedValues.join(', ')}`;
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
