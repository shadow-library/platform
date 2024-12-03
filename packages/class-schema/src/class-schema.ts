/**
 * Importing npm packages
 */
import merge from 'deepmerge';
import { Class, SetRequired } from 'type-fest';

/**
 * Importing user defined packages
 */
import { FIELD_OPTIONS_METADATA, FIELD_TYPE_METADATA, SCHEMA_FIELDS_METADATA, SCHEMA_OPTIONS_METADATA } from './constants';
import { FieldOptions } from './decorators';
import { JSONObjectSchema, JSONSchema } from './interfaces';

/**
 * Defining types
 */

export type ParsedSchema = SetRequired<JSONSchema<false>, '$id' | 'type'>;

export type SchemaClass = Class<unknown> | [Class<unknown>];

/**
 * Declaring the constants
 */
const primitiveTypes: Class<unknown>[] = [String, Number, Boolean, Object, Array];
const isJSONObjectSchema = (schema: JSONSchema): schema is JSONObjectSchema<false> => schema.type === 'object';

export class ClassSchema {
  private readonly schema: ParsedSchema;

  constructor(Class: SchemaClass) {
    if (Array.isArray(Class)) {
      this.schema = this.getSchema(Array);
      const schemaId = this.getSchemaId(Class[0]);
      this.schema.$id = `[${schemaId}]`;
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
    let schema = Reflect.getMetadata(SCHEMA_OPTIONS_METADATA, Class) as ParsedSchema | undefined;
    if (primitiveTypes.includes(Class)) schema = { $id: Class.name, type: Class.name.toLowerCase() as any };
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
    if (!isJSONObjectSchema(schema)) return;
    const fields: string[] = Reflect.getMetadata(SCHEMA_FIELDS_METADATA, Class.prototype) ?? [];
    for (const field of fields) {
      const { required, ...fieldSchema } = Reflect.getMetadata(FIELD_OPTIONS_METADATA, Class.prototype, field) as FieldOptions;
      const type = this.getFieldType(Class, field);
      if (!schema.properties) schema.properties = {};
      schema.properties[field] = merge(type, fieldSchema);
      if (required !== false) {
        if (!schema.required) schema.required = [];
        schema.required.push(field);
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
