/**
 * Importing npm packages
 */
import assert from 'node:assert';

import { FastifyDynamicSwaggerOptions } from '@fastify/swagger';
import { FastifyApiReferenceOptions } from '@scalar/fastify-api-reference';
import { OpenAPIV3 } from 'openapi-types';
import { Inject, Injectable } from '@shadow-library/app';
import { JSONSchema } from '@shadow-library/class-schema';
import { AppError, Config, utils } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { DEFAULT_CONFIGS, HTTP_CORE_CONFIGS } from '../http-core.constants';
import { type HttpCoreModuleOptions, type OpenAPIOptions } from '../http-core.types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const COMPONENT_PREFIX = '#/components/schemas/';
const COMPOSED_SCHEMA_ID = /^class-schema:(oneOf|anyOf)\?/;

@Injectable()
export class OpenApiService {
  private readonly options: OpenAPIOptions;

  private schemaCounter = 0;
  private schemaIdMap = new Map<string, string>();

  constructor(@Inject(HTTP_CORE_CONFIGS) options: HttpCoreModuleOptions) {
    /** The stamped version ties the served contract to the code revision that produced it, so consumers can trace generated artifacts back to a commit */
    const version = options.openapi.info?.version ?? Config.register('app.version', DEFAULT_CONFIGS['app.version']);
    this.options = { ...options.openapi, info: { title: Config.get('app.name'), ...options.openapi.info, version } };
  }

  private resolveSchemaId(id: string): string {
    if (!this.options.normalizeSchemaIds) return id;
    if (!id.startsWith('class-schema:')) return id;

    const existing = this.schemaIdMap.get(id);
    if (existing) return existing;

    const existingValues = Array.from(this.schemaIdMap.values());
    let normalized = id.replace('class-schema:', '').split(/[:-]/g)[0] as string;
    if (existingValues.includes(normalized)) {
      for (let index = 1; index <= 100; index++) {
        const candidate = normalized + index;
        if (!existingValues.includes(candidate)) {
          normalized = candidate;
          break;
        }
        if (index === 100) throw AppError.internal(`Unable to normalize schema ID for ${id} after 100 attempts`);
      }
    }

    this.schemaIdMap.set(id, normalized);
    return normalized;
  }

  /**
   * Rewrites every internal class-schema reference below `node` to its `#/components/schemas` name, in place.
   * A reference to a composition is replaced by the composition itself: its `type`/`additionalProperties` are
   * dropped on the way in, because "an object with no properties" and "one of these schemas" contradict each
   * other, and a reader that honours the first rejects every variant.
   */
  private resolveRefs(node: JSONSchema | undefined, compositions: Map<string, JSONSchema>): void {
    if (!node || typeof node !== 'object') return;

    if (node.$ref && !node.$ref.startsWith(COMPONENT_PREFIX)) {
      const composition = compositions.get(node.$ref);
      if (composition) {
        delete node.$ref;
        Object.assign(node, utils.object.omitKeys(structuredClone(composition), ['$id', 'definitions', 'type', 'additionalProperties']));
      } else node.$ref = `${COMPONENT_PREFIX}${this.resolveSchemaId(node.$ref)}`;
    }

    const mapping = node.discriminator?.mapping;
    for (const key in mapping) {
      const target = mapping[key] as string;
      if (!target.startsWith(COMPONENT_PREFIX)) mapping[key] = `${COMPONENT_PREFIX}${this.resolveSchemaId(target)}`;
    }

    const children = [
      node.items,
      node.not,
      ...Object.values(node.properties ?? {}),
      ...Object.values(node.patternProperties ?? {}),
      ...(node.oneOf ?? []),
      ...(node.anyOf ?? []),
      ...(node.allOf ?? []),
    ];
    for (const child of children) this.resolveRefs(child, compositions);
  }

  private normalizeOpenapiSpec(document: Partial<OpenAPIV3.Document>, schema: JSONSchema, normaliseSchema = true): JSONSchema {
    document.components ??= {};
    document.components.schemas ??= {};
    assert(schema.$id, 'Schema must have an $id');

    const schemaId = this.resolveSchemaId(schema.$id);
    if (document.components.schemas[schemaId]) return { $ref: `#/components/schemas/${schemaId}` };

    const definitions = [schema, ...Object.values(schema.definitions ?? {})];
    // A composition has no name a consumer could use — `SchemaComposer` derives its id from the classes it
    // unites so identical compositions dedupe — so it is inlined at every reference instead of published as
    // a component. Its own references are resolved first, because inlining copies the body as it stands.
    const compositions = new Map<string, JSONSchema>();
    for (const definition of definitions) {
      if (definition.$id && COMPOSED_SCHEMA_ID.test(definition.$id)) compositions.set(definition.$id, definition);
    }
    for (const composition of compositions.values()) this.resolveRefs(composition, compositions);

    for (const definition of definitions) {
      if (definition.required?.length === 0) delete definition.required;
      this.resolveRefs(definition, compositions);
      if (definition.$id && compositions.has(definition.$id)) continue;
      if (definition.$id && ((schema === definition && normaliseSchema) || schema !== definition)) {
        const resolvedId = this.resolveSchemaId(definition.$id);
        document.components.schemas[resolvedId] = utils.object.omitKeys(definition, ['definitions', '$id']);
      }
    }

    if (!normaliseSchema) return schema;
    return { $ref: `#/components/schemas/${schemaId}` };
  }

  private normalizeParamsOpenapiSpec(document: Partial<OpenAPIV3.Document>, schema: JSONSchema): JSONSchema {
    const normalizedSchema = this.normalizeOpenapiSpec(document, schema, false);

    const requiredFields = new Set(normalizedSchema.required);
    const properties = normalizedSchema.properties ?? {};
    for (const key in properties) {
      const originalSchema = properties[key] as JSONSchema;
      if (originalSchema.default !== undefined) requiredFields.delete(key);
    }

    if (requiredFields.size) normalizedSchema.required = Array.from(requiredFields);
    else delete normalizedSchema.required;

    return normalizedSchema;
  }

  getFastifySwaggerOptions(): FastifyDynamicSwaggerOptions {
    return {
      openapi: utils.object.omitKeys(this.options, ['enabled', 'routePrefix', 'normalizeSchemaIds']),
      refResolver: { buildLocalReference: (json, _1, _2, index) => (typeof json.$id === 'string' ? json.$id : `Fragment-${index}`) },
      transform: opts => {
        const schema = opts.schema as JSONSchema;
        const document = (opts as any).openapiObject;
        if (!schema.$id) schema.$id = `AutoGeneratedSchema${++this.schemaCounter}`;
        const swaggerSchema = structuredClone(schema);
        const responses = (swaggerSchema.response ?? {}) as Record<string, JSONSchema>;
        if (swaggerSchema.body) swaggerSchema.body = this.normalizeOpenapiSpec(document, swaggerSchema.body);
        if (swaggerSchema.querystring) swaggerSchema.querystring = this.normalizeParamsOpenapiSpec(document, swaggerSchema.querystring);
        if (swaggerSchema.params) swaggerSchema.params = this.normalizeParamsOpenapiSpec(document, swaggerSchema.params);
        for (const statusCode in responses) responses[statusCode] = this.normalizeOpenapiSpec(document, responses[statusCode] as JSONSchema);
        return { schema: swaggerSchema, url: opts.url };
      },
    };
  }

  getScalarOptions(): FastifyApiReferenceOptions {
    return { routePrefix: this.options.routePrefix };
  }
}
