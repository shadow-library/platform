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

export interface TransformerContext {
  parent: object;
  field: string;
  path: string;
  root: object;
}

export type FieldFilter = (schema: JSONSchema) => boolean;

export type TransformerAction = (value: unknown, schema: JSONSchema, ctx: TransformerContext) => unknown;

export type Transformer<T extends object = object> = (data: T, action: TransformerAction) => T;

type InternalTransformer = (data: object, action: TransformerAction, ctx?: InternalContext) => object;

interface InternalContext {
  parent: object;
  root: object;
  prefix: string;
}

interface ContextState {
  transformers: Record<string, InternalTransformer>;
  schemas: Record<string, JSONSchema>;
  constructPath(prefix: string, field: string | number): string;
}

/**
 * Declaring the constants
 */

export class TransformerFactory {
  private readonly context: ContextState;

  constructor(private readonly filter: FieldFilter) {
    this.context = { transformers: {}, schemas: {}, constructPath: (prefix, field) => (prefix ? `${prefix}.${field.toString()}` : field.toString()) };
  }

  private generateTransformer(schema: ParsedSchema): MaybeNull<InternalTransformer> {
    let fn = `if (!ctx) ctx = { parent: null, root: data, prefix: '' };\n`;
    if (this.filter(schema)) fn += `data = action(data, this.schemas['${schema.$id}'], ctx);`;

    /** Handling root array schema */
    if (schema.type === 'array' && schema.items) {
      const isFilter = this.filter(schema.items);
      if (!isFilter && !schema.items.$ref) return null;
      if (isFilter) {
        fn += `
          if (Array.isArray(data)) {
            const getContext = (index) => ({ ...ctx, field: index.toString(), path: this.constructPath(ctx.prefix, index) });
            data = data.map((value, index) => action(value, this.schemas['${schema.$id}'], getContext(index)));
          }
        `;
      } else {
        fn += `
          if (Array.isArray(data)) {
            const transformer = this.transformers['${schema.items.$ref}'];
            if (transformer) {
              const getContext = (index) => ({ ...ctx, prefix: this.constructPath(ctx.prefix, index) });
              data = data.map((value, index) => transformer(value, action, getContext(index)));
            }
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
            const childContext = { parent: data, root: ctx.root, field: '${field}', path: this.constructPath(ctx.prefix, '${field}') };
            data.${field} = action(value, this.schemas['${schema.$id}'].properties.${field}, childContext);
          }
        `;
      }

      for (const field of refFields) {
        const refSchema = schema.properties[field] as JSONSchema;
        if (refSchema.type === 'array') {
          fn += `
            if (Array.isArray(data.${field})) {
              const transformer = this.transformers['${refSchema.items?.$ref}'];
              if (transformer) {
                const getContext = (index) => ({ parent: data, root: ctx.root, prefix: this.constructPath(ctx.prefix, '${field}.' + index) });
                data.${field} = data.${field}.map((value, index) => transformer(value, action, getContext(index)));
              }
            }
          `;
        } else {
          fn += `
            if (data.${field} != null) {
              const transformer = this.transformers['${refSchema.$ref}'];
              if (transformer) {
                const childContext = { parent: data, root: ctx.root, prefix: this.constructPath(ctx.prefix, '${field}') };
                data.${field} = transformer(data.${field}, action, childContext);
              }
            }
          `;
        }
      }
    }

    if (!fn.trim()) return null;
    const func = new Function('data', 'action', 'ctx', `${fn}\n return data;`) as Transformer;
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
