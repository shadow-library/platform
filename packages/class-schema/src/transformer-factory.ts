/**
 * Importing npm packages
 */
import assert from 'node:assert';

import { AppError, MaybeNull } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { ClassSchema, ParsedSchema } from './class-schema';
import { JSONSchema, JSONSchemaType } from './interfaces';

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
  transformers: Record<string, InternalTransformer | null>;
  schemas: Record<string, JSONSchema>;
  constructPath(prefix: string, field: string | number): string;
}

interface VariantCondition {
  condition: string;
  schemaId: string;
}

interface FieldVariantSpec {
  const?: any;
  enum?: any[];
  type?: JSONSchemaType;
}

interface FieldDefinition {
  name: string;
  variants: Record<string, FieldVariantSpec>;
}

/**
 * Declaring the constants
 */
const noop: Transformer = value => value;

/** Renders a bracketed member access so arbitrary keys (kebab-case, quotes, reserved words) stay valid in generated code */
const member = (base: string, key: string | number): string => `${base}[${JSON.stringify(key.toString())}]`;

export class TransformerFactory {
  private readonly context: ContextState;

  constructor(private readonly filter: FieldFilter) {
    this.context = { transformers: {}, schemas: {}, constructPath: (prefix, field) => (prefix ? `${prefix}.${field.toString()}` : field.toString()) };
  }

  private hasTransformTargets(schema: JSONSchema): boolean {
    if (this.filter(schema)) return true;
    if (schema.type === 'array' && schema.items && this.hasTransformTargets(schema.items)) return true;

    if (schema.type === 'object' && schema.properties) {
      const isTransformable = Object.values(schema.properties).some(subSchema => this.hasTransformTargets(subSchema));
      if (isTransformable) return true;
    }

    if (schema.definitions) {
      const isTransformable = Object.values(schema.definitions).some(defSchema => this.hasTransformTargets(defSchema));
      if (isTransformable) return true;
    }

    return false;
  }

  hasTransformableFields(schema: JSONSchema): boolean {
    if (!ClassSchema.isBranded(schema)) throw AppError.internal('Invalid schema: only schemas built with this package are supported');
    return this.hasTransformTargets(schema);
  }

  private hasUniqueFieldValues(fieldDef: FieldDefinition, key: keyof FieldVariantSpec): boolean {
    switch (key) {
      case 'const': {
        const allValues = Object.values(fieldDef.variants).filter(v => v.const !== undefined);
        const uniqueValues = new Set(allValues);
        return allValues.length > 0 && uniqueValues.size === allValues.length;
      }

      case 'type': {
        const allValues = Object.values(fieldDef.variants).filter(v => v.type !== undefined);
        if (allValues.length === 1) return true;
        const uniqueValues = new Set(allValues.map(v => v.type));
        return allValues.length > 0 && uniqueValues.size === allValues.length;
      }

      case 'enum': {
        const variants = Object.values(fieldDef.variants);
        for (let i = 0; i < variants.length; i++) {
          const variantA = variants[i] as FieldVariantSpec;
          if (!variantA.enum?.length) return false;
          for (let j = i + 1; j < variants.length; j++) {
            const variantB = variants[j] as FieldVariantSpec;
            if (!variantB.enum?.length) return false;
            const intersection = variantA.enum.filter(value => variantB.enum?.includes(value));
            if (intersection.length > 0) return false;
          }
        }

        return true;
      }
    }
  }

  private getDiscriminatorConditions(variants: ParsedSchema[]): VariantCondition[] | null {
    const discriminator: VariantCondition[] = [];

    /** Converting the variants into field definitions */
    const fields: FieldDefinition[] = [];
    for (const variant of variants) {
      for (const key in variant.properties) {
        if (!variant.required?.includes(key)) continue;
        const subSchema = variant.properties[key] as ParsedSchema;
        let fieldDef = fields.find(f => f.name === key);
        if (!fieldDef) {
          fieldDef = { name: key, variants: {} };
          fields.push(fieldDef);
        }

        assert(!Array.isArray(subSchema.type), 'Variant property schema type must not be an array');
        fieldDef.variants[variant.$id] = { const: subSchema.const, enum: subSchema.enum, type: subSchema.type };
      }
    }

    /** Trying to find a valid const discriminator */
    const validConstDiscriminator = fields.find(fieldDef => this.hasUniqueFieldValues(fieldDef, 'const'));
    if (validConstDiscriminator) {
      for (const variant of variants) {
        const variantSpec = validConstDiscriminator.variants[variant.$id];
        assert(variantSpec?.const !== undefined, 'Variant must have a const value for the discriminator field');
        const value = JSON.stringify(variantSpec.const);
        const condition = `${member('data', validConstDiscriminator.name)} === ${value}`;
        discriminator.push({ condition, schemaId: variant.$id });
      }

      return discriminator;
    }

    /** Trying to find a valid type discriminator */
    const typeDiscriminators = new Map<string, string>();
    const uniqueTypeFields = fields.filter(fieldDef => this.hasUniqueFieldValues(fieldDef, 'type'));
    for (const typeField of uniqueTypeFields) {
      if (typeDiscriminators.has(typeField.name)) continue;
      for (const schemaId in typeField.variants) {
        const variantSpec = typeField.variants[schemaId] as FieldVariantSpec;
        const condition = `typeof ${member('data', typeField.name)} === ${JSON.stringify(variantSpec.type)}`;
        typeDiscriminators.set(schemaId, condition);
      }
    }
    if (typeDiscriminators.size === variants.length) {
      for (const [schemaId, condition] of typeDiscriminators) discriminator.push({ condition, schemaId });
      return discriminator;
    }

    /** Trying to find a valid enum discriminator */
    const validEnumDiscriminator = fields.find(fieldDef => this.hasUniqueFieldValues(fieldDef, 'enum'));
    if (validEnumDiscriminator) {
      const access = member('data', validEnumDiscriminator.name);
      for (const variant of variants) {
        const variantSpec = validEnumDiscriminator.variants[variant.$id] as FieldVariantSpec;
        assert(variantSpec?.enum !== undefined, 'Variant must have an enum value for the discriminator field');
        const condition = variantSpec.enum.map(value => `${access} === ${JSON.stringify(value)}`).join(' || ');
        discriminator.push({ condition, schemaId: variant.$id });
      }

      return discriminator;
    }

    return null;
  }

  private generateTransformer(schema: ParsedSchema): MaybeNull<InternalTransformer> {
    const cachedTransformer = this.context.transformers[schema.$id];
    if (cachedTransformer !== undefined) return cachedTransformer;
    this.context.schemas[schema.$id] = schema;

    let ops = '';
    if (this.filter(schema)) ops += `data = action(data, ${member('this.schemas', schema.$id)}, ctx);`;

    /** Handling root array schema */
    if (schema.type === 'array' && schema.items) {
      const isFilter = this.filter(schema.items);
      if (!isFilter && !schema.items.$ref) return (this.context.transformers[schema.$id] = null);
      if (isFilter) {
        ops += `
          if (Array.isArray(data)) {
            const getContext = (index) => ({ ...ctx, field: index.toString(), path: this.constructPath(ctx.prefix, index) });
            data = data.map((value, index) => action(value, ${member('this.schemas', schema.$id)}, getContext(index))).filter(value => value !== undefined);
          }
        `;
      } else {
        ops += `
          if (Array.isArray(data)) {
            const transformer = ${member('this.transformers', schema.items.$ref as string)};
            if (transformer) {
              const getContext = (index) => ({ ...ctx, prefix: this.constructPath(ctx.prefix, index) });
              data = data.map((value, index) => transformer(value, action, getContext(index))).filter(value => value !== undefined);
            }
          }
        `;
      }
    }

    /** Handling discriminators */
    if (schema.type === 'object' && (schema.anyOf || schema.oneOf)) {
      const variantIds = schema.anyOf ?? schema.oneOf ?? [];
      const variants = variantIds.map(variant => (variant.$ref ? this.context.schemas[variant.$ref] : variant)) as ParsedSchema[];
      const discriminators = this.getDiscriminatorConditions(variants);
      if (discriminators) {
        for (const { condition, schemaId } of discriminators) {
          ops += `
          if (${condition}) {
            const transformer = ${member('this.transformers', schemaId)};
            if (transformer) data = transformer(data, action, ctx);
          }
        `;
        }
      } else {
        for (const variant of variants) {
          ops += `
          {
            const transformer = ${member('this.transformers', variant.$id)};
            if (transformer) data = transformer(data, action, ctx);
          }
          `;
        }
      }
    }

    if (schema.type === 'object' && schema.properties) {
      const fields = [];
      const refFields = [];
      for (const key of Object.keys(schema.properties)) {
        const subSchema = schema.properties[key] as JSONSchema;
        const isRef = subSchema.$ref || (subSchema.type === 'array' && subSchema.items?.$ref);
        if (this.filter(subSchema)) fields.push(key);
        else if (isRef) refFields.push(key);
      }

      for (const field of fields) {
        const access = member('data', field);
        ops += `
          if (${JSON.stringify(field)} in data) {
            const value = ${access};
            const childContext = { parent: data, root: ctx.root, field: ${JSON.stringify(field)}, path: this.constructPath(ctx.prefix, ${JSON.stringify(field)}) };
            ${access} = action(value, ${member('this.schemas', schema.$id)}.properties[${JSON.stringify(field)}], childContext);
            if (${access} === undefined) delete ${access};
          }
        `;
      }

      for (const field of refFields) {
        const access = member('data', field);
        const refSchema = schema.properties[field] as JSONSchema;
        if (refSchema.type === 'array') {
          ops += `
            if (Array.isArray(${access})) {
              const transformer = ${member('this.transformers', refSchema.items?.$ref as string)};
              if (transformer) {
                const getContext = (index) => ({ parent: data, root: ctx.root, prefix: this.constructPath(ctx.prefix, ${JSON.stringify(field + '.')} + index) });
                ${access} = ${access}.map((value, index) => transformer(value, action, getContext(index))).filter(value => value !== undefined);
              }
            }
          `;
        } else {
          ops += `
            if (${JSON.stringify(field)} in data) {
              const transformer = ${member('this.transformers', refSchema.$ref as string)};
              if (transformer) {
                const childContext = { parent: data, root: ctx.root, prefix: this.constructPath(ctx.prefix, ${JSON.stringify(field)}) };
                ${access} = transformer(${access}, action, childContext);
                if (${access} === undefined) delete ${access};
              }
            }
          `;
        }
      }
    }

    if (!ops.trim()) return (this.context.transformers[schema.$id] = null);

    const content = `
      if (!ctx) ctx = { parent: null, root: data, prefix: '' };
      ${ops}
      return data;
    `;

    const func = new Function('data', 'action', 'ctx', content) as Transformer;
    const transformer = func.bind(this.context);
    this.context.transformers[schema.$id] = transformer;
    return transformer;
  }

  maybeCompile(schema: ParsedSchema): MaybeNull<Transformer> {
    if (!this.hasTransformableFields(schema)) return null;
    const clonedSchema = structuredClone(schema);
    Object.values(clonedSchema.definitions || {}).forEach(def => this.generateTransformer(def));
    delete clonedSchema.definitions;
    return this.generateTransformer(clonedSchema);
  }

  compile(schema: ParsedSchema): Transformer {
    return this.maybeCompile(schema) || noop;
  }
}
