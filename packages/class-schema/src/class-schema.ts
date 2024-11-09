/**
 * Importing npm packages
 */
import { Class } from 'type-fest';
import merge from 'deepmerge';

/**
 * Importing user defined packages
 */
import { JSONSchema } from './interfaces';
import { FIELD_OPTIONS_METADATA, FIELD_TYPE_METADATA, SCHEMA_FIELDS_METADATA, SCHEMA_OPTIONS_METADATA } from './constants';
import { SchemaOptions } from './decorators';
import assert from 'assert';

/**
 * Defining types
 */

interface FieldSchema {
  required: boolean;
  schema: JSONSchema;
}

/**
 * Declaring the constants
 */

export class ClassSchema {
  private readonly schemas = new Map<Class<unknown>, JSONSchema>();

  private getFieldType(Class: Class<unknown>, field: string): JSONSchema {
    const fieldType = Reflect.getMetadata(FIELD_TYPE_METADATA, Class.prototype, field);
    const schema: JSONSchema = {};

    if (fieldType === String) schema.type = 'string';
    else if (fieldType === Boolean) schema.type = 'boolean';
    else if (fieldType === Number) schema.type = 'number';
    else if (Array.isArray(fieldType)) {
      const Class = fieldType[0] as Class<unknown>;
      schema.type = 'array';
      schema.items = { $ref: this.getSchemaId(Class) };
    } else schema.$ref = this.getSchemaId(fieldType);

    return schema;
  }

  private getFieldSchema(Class: Class<unknown>, field: string): FieldSchema {
    const { required, ...schema } = Reflect.getMetadata(FIELD_OPTIONS_METADATA, Class.prototype, field);
    return { required: required ?? true, schema };
  }

  // private getChildSchemas(parent: Class<unknown>): Class<unknown>[] {
  //   return [];
  // }

  addSchema(Class: Class<unknown>): this {
    if (this.schemas.has(Class)) return this;

    const schemaOptions = Reflect.getMetadata(SCHEMA_OPTIONS_METADATA, Class) as SchemaOptions | undefined;
    if (!schemaOptions) throw new Error(`Class '${Class.name}' is not a schema. Add the @Schema() to the class`);

    const schema = structuredClone(schemaOptions);
    this.schemas.set(Class, schema);
    schema.definitions ??= {};
    schema.properties ??= {};
    schema.required ??= [];

    const fields: string[] = Reflect.getMetadata(SCHEMA_FIELDS_METADATA, Class.prototype);
    for (const field of fields) {
      const fieldSchema = this.getFieldSchema(Class, field);
      if (fieldSchema.required && !schema.required.includes(field)) schema.required.push(field);

      const type = this.getFieldType(Class, field);
      schema.properties[field] = merge(type, fieldSchema.schema);
    }

    return this;
  }

  getSchema(Class: Class<unknown>): JSONSchema {
    this.addSchema(Class);
    return this.schemas.get(Class) as JSONSchema;
  }

  getSchemaId(Class: Class<unknown>): string {
    const schema = this.getSchema(Class);
    assert(schema.$id, `Unexpected $id not present in class '${Class.name}'`);
    return schema.$id;
  }
}
