/**
 * Importing npm packages
 */
import merge from 'deepmerge';
import { Class, SetRequired } from 'type-fest';

/**
 * Importing user defined packages
 */
import { FIELD_OPTIONS_METADATA, FIELD_TYPE_METADATA, SCHEMA_FIELDS_METADATA, SCHEMA_OPTIONS_METADATA } from './constants';
import { FieldOptions, SchemaOptions } from './decorators';
import { JSONSchema } from './interfaces';

/**
 * Defining types
 */

type ParsedSchema = SetRequired<JSONSchema, '$id' | 'type' | 'properties' | 'required' | 'definitions'>;

/**
 * Declaring the constants
 */

export class ClassSchema {
  private readonly schema: ParsedSchema;

  constructor(Class: Class<unknown>) {
    this.schema = this.getSchema(Class);
    this.populateSchema(this.schema, Class);
  }

  private getSchema(Class: Class<unknown>): ParsedSchema {
    const schema = Reflect.getMetadata(SCHEMA_OPTIONS_METADATA, Class) as SchemaOptions | undefined;
    if (!schema) throw new Error(`Class '${Class.name}' is not a schema. Add the @Schema() to the class`);
    return merge<ParsedSchema>(schema, { type: 'object', properties: {}, required: [], definitions: {} });
  }

  private addDefinition(Class: Class<unknown>): string {
    const schema = this.getSchema(Class);
    this.schema.definitions[schema.$id] = schema;
    this.populateSchema(schema, Class);
    return schema.$id;
  }

  private getSchemaId(Class: Class<unknown>): string {
    const schema = this.getSchema(Class);
    if (this.schema.$id === schema.$id) return schema.$id;
    const definition = this.schema.definitions[schema.$id];
    if (definition) return schema.$id;
    return this.addDefinition(Class);
  }

  private getFieldType(Class: Class<unknown>, field: string): JSONSchema {
    const getType = Reflect.getMetadata(FIELD_TYPE_METADATA, Class.prototype, field);
    const fieldType = getType();
    const schema: JSONSchema = {};

    if (fieldType === String) schema.type = 'string';
    else if (fieldType === Boolean) schema.type = 'boolean';
    else if (fieldType === Number) schema.type = 'number';
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
    const fields: string[] = Reflect.getMetadata(SCHEMA_FIELDS_METADATA, Class.prototype) ?? [];
    for (const field of fields) {
      const { required, ...fieldSchema } = Reflect.getMetadata(FIELD_OPTIONS_METADATA, Class.prototype, field) as FieldOptions;
      const type = this.getFieldType(Class, field);
      schema.properties[field] = merge(type, fieldSchema);
      if (required !== false) schema.required.push(field);
    }
  }

  getId(): string {
    return this.schema.$id;
  }

  getJSONSchema(clone = false): ParsedSchema {
    return clone ? structuredClone(this.schema) : this.schema;
  }
}
