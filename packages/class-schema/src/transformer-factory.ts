/**
 * Importing npm packages
 */
import { InternalError, MaybeNull } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { ParsedSchema } from './class-schema';
import { BRAND } from './constants';
import { JSONSchema } from './interfaces';

/**
 * Defining types
 */

export type FieldFilter = (schema: JSONSchema) => boolean;

export type TransformerAction = (value: unknown, schema: JSONSchema, path: string, obj: object) => unknown;

export type Transformer<T extends object = object> = (data: T, action: TransformerAction) => T;

interface ContextState {
  transformers: Record<string, Transformer>;
  schemas: Record<string, JSONSchema>;
}

/**
 * Declaring the constants
 */

export class TransformerFactory {
  private readonly context: ContextState;

  constructor(private readonly filter: FieldFilter) {
    this.context = { transformers: {}, schemas: {} };
  }

  private generateTransformer(schema: ParsedSchema): MaybeNull<Transformer> {
    let fn = '';
    if (this.filter(schema)) fn += `data = action(data, this.schemas['${schema.$id}']);`;

    /** Handling root array schema */
    if (schema.type === 'array' && schema.items) {
      const isFilter = this.filter(schema.items);
      if (!isFilter && !schema.items.$ref) return null;
      if (isFilter) {
        fn += `
          if (Array.isArray(data)) {
            data = data.map(value => action(value, this.schemas['${schema.$id}']));
          }
        `;
      } else {
        fn += `
          if (Array.isArray(data)) {
            const transformer = this.transformers['${schema.items.$ref}'];
            if (transformer) data = data.map(value => transformer(value, action));
          }
        `;
      }
    }

    if (schema.type === 'object' && schema.properties) {
      const fields = [];
      const refFields = [];
      const keys = Object.keys(schema.properties);
      for (const key of keys) {
        const subSchema = schema.properties[key] as JSONSchema;
        const isRef = subSchema.$ref || (subSchema.type === 'array' && subSchema.items?.$ref);
        if (this.filter(subSchema)) fields.push(key);
        else if (isRef) refFields.push(key);
      }

      if (!fields.length && !refFields.length) return null;
      for (const field of fields) {
        fn += `
          if (data.${field} != null) {
            const value = data.${field};
            data.${field} = action(value, this.schemas['${schema.$id}'].properties.${field});
          }
        `;
      }

      for (const field of refFields) {
        const refSchema = schema.properties[field] as JSONSchema;
        if (refSchema.type === 'array') {
          fn += `
            if (Array.isArray(data.${field})) {
              const transformer = this.transformers['${refSchema.items?.$ref}'];
              if (transformer) data.${field} = data.${field}.map(value => transformer(value, action));
            }
          `;
        } else {
          fn += `
            if (data.${field} != null) {
              const transformer = this.transformers['${refSchema.$ref}'];
              if (transformer) data.${field} = transformer(data.${field}, action);
            }
          `;
        }
      }
    }

    if (!fn.trim()) return null;
    const func = new Function('data', 'action', `${fn}\n return data;`) as Transformer;
    const transformer = func.bind(this.context);
    this.context.transformers[schema.$id] = transformer;
    return transformer;
  }

  compile(schema: ParsedSchema): Transformer {
    if (!(schema as Record<symbol, boolean>)[BRAND]) throw new InternalError('Invalid schema: only schemas built with this package are supported');

    const clonedSchema = structuredClone(schema);
    delete clonedSchema.definitions;
    this.context.schemas[schema.$id] = clonedSchema;

    const defs = schema.definitions || {};
    for (const def of Object.values(defs)) {
      if (this.context.transformers[def.$id]) continue;
      this.context.schemas[def.$id] = def;
      const transformer = this.generateTransformer(def);
      if (transformer) this.context.transformers[def.$id] = transformer;
    }

    const transformer = this.generateTransformer(schema) || (value => value);
    this.context.transformers[schema.$id] = transformer;
    return transformer;
  }
}
