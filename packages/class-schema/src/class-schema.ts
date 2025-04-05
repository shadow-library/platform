/**
 * Importing npm packages
 */
import merge from 'deepmerge';
import { Class, SetRequired } from 'type-fest';

/**
 * Importing user defined packages
 */
import { FIELD_OPTIONS_METADATA, FIELD_TYPE_METADATA, Integer, SCHEMA_EXTRA_PROPERTIES_METADATA, SCHEMA_FIELDS_METADATA, SCHEMA_OPTIONS_METADATA } from './constants';
import { SchemaOptions } from './decorators';
import { AnyFieldSchema, JSONSchema } from './interfaces';

/**
 * Defining types
 */

export type ParsedSchema = SetRequired<JSONSchema, '$id' | 'type'>;

export type SchemaClass = Class<unknown> | [Class<unknown>];

export interface ClassSchemaOptions {
  shallow?: boolean;
  dependencies?: Set<Class<unknown>>;
}

/**
 * Declaring the constants
 */
const primitiveTypes: Class<unknown>[] = [String, Number, Boolean, Object, Array];

export class ClassSchema<T extends SchemaClass = SchemaClass> {
  private readonly schema: ParsedSchema;
  private readonly options: ClassSchemaOptions;

  constructor(Class: T, options: ClassSchemaOptions = {}) {
    this.options = options;

    if (Array.isArray(Class)) {
      this.schema = this.getSchema(Array);
      const schemaId = this.getSchemaId(Class[0]);
      this.schema.$id = `${schemaId}?type=Array`;
      this.schema.items ??= { $ref: schemaId };
      return;
    }

    this.schema = this.getSchema(Class);
    this.populateSchema(this.schema, Class);
  }

  static generate(Class: SchemaClass): ParsedSchema {
    return new ClassSchema(Class).getJSONSchema();
  }

  private getSchema(Class: Class<unknown>): ParsedSchema {
    if (primitiveTypes.includes(Class)) return { $id: Class.name, type: Class.name.toLowerCase() as any };
    const schema = Reflect.getMetadata(SCHEMA_OPTIONS_METADATA, Class) as ParsedSchema | undefined;
    if (!schema) throw new Error(`Class '${Class.name}' is not a schema. Add the @Schema() to the class`);
    return structuredClone(schema);
  }

  private addDefinition(Class: Class<unknown>): string {
    const schema = this.getSchema(Class);
    if (!this.schema.definitions) this.schema.definitions = {};
    this.schema.definitions[schema.$id] = schema;
    this.populateSchema(schema, Class);
    return schema.$id;
  }

  private getSchemaId(Class: Class<unknown>): string {
    const schema = this.getSchema(Class);
    if (this.schema.$id === schema.$id) return schema.$id;
    const definition = this.schema.definitions?.[schema.$id];
    if (definition) return schema.$id;
    this.options.dependencies?.add(Class);
    if (this.options.shallow) return schema.$id;
    return this.addDefinition(Class);
  }

  private getFieldSchema(Class: Class<unknown>, field?: string): JSONSchema {
    let fieldType = Class;
    const schema: JSONSchema = {};
    if (field) {
      const getType = Reflect.getMetadata(FIELD_TYPE_METADATA, Class.prototype, field);
      fieldType = getType();
    }

    if (fieldType === String) schema.type = 'string';
    else if (fieldType === Boolean) schema.type = 'boolean';
    else if (fieldType === Number) schema.type = 'number';
    else if (fieldType === Integer) schema.type = 'integer';
    else if (fieldType === Object) schema.type = 'object';
    else if (fieldType === Array) schema.type = 'array';
    else if (!Array.isArray(fieldType)) schema.$ref ??= this.getSchemaId(fieldType);
    else {
      const Class = fieldType[0] as Class<unknown>;
      schema.type = 'array';
      schema.items ??= { $ref: this.getSchemaId(Class) };
    }

    return schema;
  }

  private populateSchema(schema: ParsedSchema, Class: Class<unknown>): void {
    if (schema.type !== 'object') return;

    /** Adding the extra properties to the schema */
    const extraProperties = Reflect.getMetadata(SCHEMA_EXTRA_PROPERTIES_METADATA, Class) as Pick<SchemaOptions, 'additionalProperties' | 'patternProperties'>;
    if (extraProperties) {
      const { additionalProperties, patternProperties } = extraProperties;
      if (typeof additionalProperties === 'boolean') schema.additionalProperties = additionalProperties;
      else if (additionalProperties) schema.additionalProperties = this.getFieldSchema(additionalProperties);

      if (patternProperties) {
        schema.patternProperties ??= {};
        for (const pattern in patternProperties) {
          const Class = patternProperties[pattern] as Class<unknown>;
          const patternSchema = this.getFieldSchema(Class);
          schema.patternProperties[pattern] = patternSchema;
        }
      }
    }

    /** Adding the object properties to the schema */
    const fields: string[] = Reflect.getMetadata(SCHEMA_FIELDS_METADATA, Class.prototype) ?? [];
    for (const field of fields) {
      const fieldMetadata = Reflect.getMetadata(FIELD_OPTIONS_METADATA, Class.prototype, field) as AnyFieldSchema;
      const { optional, requiredIf, ...fieldSchema } = fieldMetadata;

      const derivedSchema = this.getFieldSchema(Class, field);
      if (!schema.properties) schema.properties = {};
      schema.properties[field] = merge(derivedSchema, fieldSchema);

      if (!schema.required) schema.required = [];
      if (!optional && !requiredIf) schema.required.push(field);

      if (requiredIf) {
        schema.dependencies ??= {};
        const dependencies = schema.dependencies[requiredIf] ?? [];
        dependencies.push(field);
        schema.dependencies[requiredIf] = dependencies;
      }
    }
  }

  getId(): string {
    return this.schema.$id;
  }

  getJSONSchema(clone = false): ParsedSchema {
    return clone ? structuredClone(this.schema) : this.schema;
  }
}
