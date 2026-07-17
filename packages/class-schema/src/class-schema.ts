/**
 * Importing npm packages
 */
import merge from 'deepmerge';
import { Class, SetRequired } from 'type-fest';

/**
 * Importing user defined packages
 */
import { BRAND, Integer, METADATA_KEYS } from './constants';
import { SchemaOptions } from './decorators';
import { EnumType } from './enum-type';
import { AnyFieldSchema, JSONSchema, JSONSchemaType } from './interfaces';
import { SchemaComposerMetadata } from './internal.types';

/**
 * Defining types
 */

export type ParsedSchema = SetRequired<JSONSchema, '$id' | 'type'> & { definitions?: Record<string, ParsedSchema> };

export type SchemaClass = EnumType | Class<unknown> | [Class<unknown>];

export interface ClassSchemaOptions {
  shallow?: boolean;
  dependencies?: Set<Class<unknown>>;
}

/**
 * Declaring the constants
 */
const primitiveTypes: Class<unknown>[] = [String, Number, Boolean, Object, Array];

/** Maps the runtime type tokens to their JSON Schema `type`, including the library-defined `Integer` marker */
const primitiveSchemaTypes = new Map<unknown, JSONSchemaType>([
  [String, 'string'],
  [Number, 'number'],
  [Boolean, 'boolean'],
  [Integer, 'integer'],
  [Object, 'object'],
  [Array, 'array'],
]);

export class ClassSchema<T extends SchemaClass = SchemaClass> {
  private readonly schema: ParsedSchema;
  private readonly options: ClassSchemaOptions;

  constructor(Class: T, options: ClassSchemaOptions = {}) {
    this.options = options;

    if (Class instanceof EnumType) this.schema = Class.toSchema();
    else if (Array.isArray(Class)) {
      this.schema = this.getSchema(Array);
      const schemaId = this.getSchemaId(Class[0]);
      this.schema.$id = `${schemaId}?type=Array`;
      this.schema.items ??= { $ref: schemaId };
    } else {
      this.schema = this.getSchema(Class);
      this.populateSchema(this.schema, Class);
    }

    this.brand(this.schema);
  }

  static generate(Class: SchemaClass): ParsedSchema {
    return new ClassSchema(Class).getJSONSchema();
  }

  static isBranded(schema: JSONSchema): boolean {
    return (schema as Record<symbol, boolean>)[BRAND] ?? false;
  }

  private brand(schema: ParsedSchema): ParsedSchema {
    Object.defineProperty(schema, BRAND, { value: true, enumerable: false });
    Object.freeze(schema);
    return schema;
  }

  private getSchema(Class: EnumType | Class<unknown>): ParsedSchema {
    if (Class instanceof EnumType) return Class.toSchema();
    if (primitiveTypes.includes(Class)) return { $id: Class.name, type: primitiveSchemaTypes.get(Class) as JSONSchemaType };
    const schema = Reflect.getMetadata(METADATA_KEYS.SCHEMA_OPTIONS, Class) as ParsedSchema | undefined;
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
      const getType = Reflect.getMetadata(METADATA_KEYS.FIELD_TYPE, Class.prototype, field);
      fieldType = getType();
    }

    const primitiveType = primitiveSchemaTypes.get(fieldType);
    if (primitiveType) schema.type = primitiveType;
    else if (!Array.isArray(fieldType)) schema.$ref = this.getSchemaId(fieldType);
    else {
      const Class = fieldType[0] as Class<unknown>;
      schema.type = 'array';
      schema.items = this.getFieldSchema(Class);
    }

    return schema;
  }

  private populateSchema(schema: ParsedSchema, Class: Class<unknown>): void {
    if (schema.type !== 'object') return;
    this.applyExtraProperties(schema, Class);
    this.applyComposition(schema, Class);
    this.applyFields(schema, Class);
  }

  /** Resolves the class-valued `additionalProperties`/`patternProperties` schema options into their JSON Schema form */
  private applyExtraProperties(schema: ParsedSchema, Class: Class<unknown>): void {
    const extraProperties = Reflect.getMetadata(METADATA_KEYS.SCHEMA_EXTRA_PROPERTIES, Class) as Pick<SchemaOptions, 'additionalProperties' | 'patternProperties'> | undefined;
    if (!extraProperties) return;

    const { additionalProperties, patternProperties } = extraProperties;
    if (typeof additionalProperties === 'boolean') schema.additionalProperties = additionalProperties;
    else if (additionalProperties) schema.additionalProperties = this.getFieldSchema(additionalProperties);

    if (patternProperties) {
      schema.patternProperties ??= {};
      for (const pattern in patternProperties) {
        schema.patternProperties[pattern] = this.getFieldSchema(patternProperties[pattern] as Class<unknown>);
      }
    }
  }

  /** Expands a composed (`anyOf`/`oneOf`/discriminator) class into its keyword and discriminator mapping */
  private applyComposition(schema: ParsedSchema, Class: Class<unknown>): void {
    const composedMetadata = Reflect.getMetadata(METADATA_KEYS.COMPOSED_CLASS, Class) as SchemaComposerMetadata | undefined;
    if (!composedMetadata) return;

    const subSchemas = composedMetadata.classes.map(cls => this.getSchemaId(cls));
    schema[composedMetadata.op] = subSchemas.map(id => ({ $ref: id }));
    if (!composedMetadata.discriminatorKey) return;

    const mapping: Record<string, string> = {};
    for (const schemaName of subSchemas) {
      const constValue = this.schema.definitions?.[schemaName]?.properties?.[composedMetadata.discriminatorKey]?.const;
      mapping[constValue] = schemaName;
    }
    schema.discriminator = { propertyName: composedMetadata.discriminatorKey, mapping };
  }

  /** Builds the object `properties`, `required` list and `dependencies` from the decorated fields */
  private applyFields(schema: ParsedSchema, Class: Class<unknown>): void {
    const fields: string[] = Reflect.getMetadata(METADATA_KEYS.SCHEMA_FIELDS, Class.prototype) ?? [];
    if (fields.length === 0) return;
    const instance = new Class() as Record<string, unknown>;

    for (const field of fields) {
      const fieldMetadata = Reflect.getMetadata(METADATA_KEYS.FIELD_OPTIONS, Class.prototype, field) as AnyFieldSchema;
      const { optional, requiredIf, nullable, ...fieldSchema } = fieldMetadata;

      const instanceValue = instance[field];
      const derivedSchema = this.getFieldSchema(Class, field);
      if (!schema.properties) schema.properties = {};
      if (nullable) derivedSchema.type = [derivedSchema.type as JSONSchemaType, 'null'];
      if (instanceValue !== undefined) derivedSchema.default = instanceValue;
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
    return clone ? this.brand(structuredClone(this.schema)) : this.schema;
  }
}
