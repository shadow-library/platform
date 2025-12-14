/**
 * Importing npm packages
 */
import { describe, expect, it, mock } from 'bun:test';

import { InternalError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { BRAND } from '@lib/constants';
import { TransformerFactory } from '@shadow-library/class-schema';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('TransformerFactory', () => {
  it('should throw error for custom schemas', () => {
    const transformer = new TransformerFactory(() => false);
    expect(() => transformer.compile({ $id: 'test', type: 'object', properties: {} })).toThrow(InternalError);
  });

  it('should create transforms for only required schema', () => {
    const schema = {
      [BRAND]: true,
      $id: 'ExtendedPrimitive',
      type: 'object',
      required: ['str', 'bool', 'obj'],
      definitions: { ObjectSchema: { $id: 'ObjectSchema', type: 'object', properties: { val: { type: 'string' } } } },
      properties: { str: { type: 'string', tagged: true }, obj: { $ref: 'ObjectSchema' } },
    };

    const factory = new TransformerFactory(schema => !!schema.tagged);
    const transformer = factory.compile(schema as any);

    expect(transformer).toBeInstanceOf(Function);
    expect(factory['context'].transformers).toStrictEqual({ ExtendedPrimitive: expect.any(Function), ObjectSchema: null });
  });

  it('should transform data with basic schema', () => {
    const data = { str: 'test', num: 123, bool: true, obj: {}, arr: [] };
    const schema = {
      [BRAND]: true,
      $id: 'ExtendedPrimitive',
      type: 'object',
      required: ['str', 'bool', 'obj'],
      properties: {
        str: { type: 'string', tagged: true },
        num: { type: 'number' },
        bool: { type: 'boolean', tagged: true },
        obj: { type: 'object' },
        arr: { type: 'array', tagged: true },
      },
    };

    const factory = new TransformerFactory(schema => !!schema.tagged);
    const transformer = factory.compile(schema as any);

    expect(transformer).toBeInstanceOf(Function);
    expect(transformer(data, () => 'xxx')).toStrictEqual({ str: 'xxx', num: 123, bool: 'xxx', obj: {}, arr: 'xxx' });
  });

  it('should return null for nothing to transform in maybeCompile', () => {
    const schema = {
      [BRAND]: true,
      $id: 'ExtendedPrimitive',
      type: 'object',
      properties: { num: { type: 'number' } },
    };

    const factory = new TransformerFactory(schema => !!schema.tagged);
    const transformer = factory.maybeCompile(schema as any);

    expect(transformer).toBeNull();
  });

  it('should return noop for nothing to transform in compile', () => {
    const schema = {
      [BRAND]: true,
      $id: 'ExtendedPrimitive',
      type: 'object',
      properties: { num: { type: 'number' } },
    };

    const factory = new TransformerFactory(schema => !!schema.tagged);
    const transformer = factory.compile(schema as any);

    expect(transformer.name).toBe('noop');
  });

  it('should transform data with array schema', () => {
    const data = [{ k: 'v1' }, { k: 'v2' }, { k: 'v3' }, { k: 'v4' }];
    const schema = {
      [BRAND]: true,
      $id: 'SampleArray',
      type: 'array',
      definitions: { Sample: { $id: 'Sample', type: 'object', tagged: true } },
      items: { $ref: 'Sample' },
    };

    const factory = new TransformerFactory(schema => !!schema.tagged);
    const transformer = factory.compile(schema as any);

    expect(transformer).toBeInstanceOf(Function);
    expect(transformer(data, () => 'xxx')).toStrictEqual(['xxx', 'xxx', 'xxx', 'xxx']);
  });

  it('should transform data with cyclic dependency schemas', () => {
    const schema = {
      [BRAND]: true,
      $id: 'File',
      type: 'object',
      definitions: {
        Folder: {
          type: 'object',
          $id: 'Folder',
          properties: {
            name: { type: 'string', tagged: true },
            files: { type: 'array', tagged: true, items: { $ref: 'File' } },
            folders: { type: 'array', items: { $ref: 'Folder' } },
          },
          required: ['name', 'files', 'folders'],
        },
      },
      required: ['name', 'parent'],
      properties: {
        name: { type: 'string', tagged: true },
        size: { type: 'number' },
        parent: { $ref: 'Folder' },
        unit: { type: 'string', tagged: true },
      },
      dependencies: { size: ['unit'] },
    };
    const data = {
      name: 'special.json',
      size: 100,
      unit: 'KB',
      parent: {
        name: 'level1',
        files: [{ name: 'level1file.txt', parent: { name: 'dummy1', files: [], folders: [] } }],
        folders: [
          {
            name: 'level2',
            files: [{ name: 'level2file.txt', parent: { name: 'dummy2', files: [], folders: [] } }],
            folders: [{ name: 'level3', files: [{ name: 'level3file.txt', parent: { name: 'dummy3', files: [], folders: [] } }], folders: [] }],
          },
        ],
      },
    };

    const factory = new TransformerFactory(schema => !!schema.tagged);
    const transformer = factory.compile(schema as any);

    expect(transformer).toBeInstanceOf(Function);
    expect(transformer(data, () => 'xxx')).toStrictEqual({
      name: 'xxx',
      size: 100,
      unit: 'xxx',
      parent: {
        name: 'xxx',
        files: 'xxx',
        folders: [{ name: 'xxx', files: 'xxx', folders: [{ name: 'xxx', files: 'xxx', folders: [] }] }],
      },
    });
  });

  it('should call the action with the correct params', () => {
    const data = { str: 'string', obj: { val: 'object' }, arr: ['array'], arrObj: [{ val: 'array-object' }] };
    const schema = {
      [BRAND]: true,
      $id: 'Custom',
      type: 'object',
      required: ['str', 'obj'],
      definitions: { CustomObject: { $id: 'CustomObject', type: 'object', properties: { val: { type: 'string', tagged: true } } } },
      properties: {
        str: { type: 'string', tagged: true },
        arr: { type: 'array', items: { type: 'string' }, tagged: true },
        obj: { $ref: 'CustomObject' },
        arrObj: { type: 'array', items: { $ref: 'CustomObject' } },
      },
    };

    const factory = new TransformerFactory(schema => !!schema.tagged);
    const transformer = factory.compile(schema as any);
    const fn = mock(() => 'xxx');
    transformer(data, fn);

    expect(fn).toHaveBeenCalledTimes(4);
    expect(fn).toHaveBeenNthCalledWith(1, 'string', schema.properties.str, { parent: data, root: data, field: 'str', path: 'str' });
    expect(fn).toHaveBeenNthCalledWith(2, ['array'], schema.properties.arr, { parent: data, root: data, field: 'arr', path: 'arr' });
    expect(fn).toHaveBeenNthCalledWith(3, 'object', schema.definitions.CustomObject.properties.val, { parent: data.obj, root: data, field: 'val', path: 'obj.val' });
    expect(fn).toHaveBeenNthCalledWith(4, 'array-object', schema.definitions.CustomObject.properties.val, {
      parent: data.arrObj[0],
      root: data,
      field: 'val',
      path: 'arrObj.0.val',
    });
  });

  describe('hasTransformableFields', () => {
    it('should throw error for non-branded schemas', () => {
      const factory = new TransformerFactory(schema => !!schema.tagged);
      expect(() => factory.hasTransformableFields({ $id: 'test', type: 'object', properties: {} })).toThrow(InternalError);
    });

    it('should return true for schema with transformable field', () => {
      const schema = {
        [BRAND]: true,
        $id: 'Simple',
        type: 'object',
        properties: { str: { type: 'string', tagged: true } },
      };

      const factory = new TransformerFactory(schema => !!schema.tagged);
      expect(factory.hasTransformableFields(schema as any)).toBe(true);
    });

    it('should return false for schema without transformable fields', () => {
      const schema = {
        [BRAND]: true,
        $id: 'Simple',
        type: 'object',
        properties: { str: { type: 'string' }, num: { type: 'number' } },
      };

      const factory = new TransformerFactory(schema => !!schema.tagged);
      expect(factory.hasTransformableFields(schema as any)).toBe(false);
    });

    it('should return true for array schema with transformable items', () => {
      const schema = {
        [BRAND]: true,
        $id: 'ArraySchema',
        type: 'array',
        items: { type: 'string', tagged: true },
      };

      const factory = new TransformerFactory(schema => !!schema.tagged);
      expect(factory.hasTransformableFields(schema as any)).toBe(true);
    });

    it('should return false for array schema without transformable items', () => {
      const schema = {
        [BRAND]: true,
        $id: 'ArraySchema',
        type: 'array',
        items: { type: 'string' },
      };

      const factory = new TransformerFactory(schema => !!schema.tagged);
      expect(factory.hasTransformableFields(schema as any)).toBe(false);
    });

    it('should return true for nested object with transformable field', () => {
      const schema = {
        [BRAND]: true,
        $id: 'NestedSchema',
        type: 'object',
        properties: {
          nested: {
            type: 'object',
            properties: { deep: { type: 'string', tagged: true } },
          },
        },
      };

      const factory = new TransformerFactory(schema => !!schema.tagged);
      expect(factory.hasTransformableFields(schema as any)).toBe(true);
    });

    it('should return true for schema with transformable field in definitions', () => {
      const schema = {
        [BRAND]: true,
        $id: 'WithDefinitions',
        type: 'object',
        definitions: {
          SubSchema: { $id: 'SubSchema', type: 'object', properties: { val: { type: 'string', tagged: true } } },
        },
        properties: { sub: { $ref: 'SubSchema' } },
      };

      const factory = new TransformerFactory(schema => !!schema.tagged);
      expect(factory.hasTransformableFields(schema as any)).toBe(true);
    });

    it('should return false for schema with no transformable fields in definitions', () => {
      const schema = {
        [BRAND]: true,
        $id: 'WithDefinitions',
        type: 'object',
        definitions: {
          SubSchema: { $id: 'SubSchema', type: 'object', properties: { val: { type: 'string' } } },
        },
        properties: { sub: { $ref: 'SubSchema' } },
      };

      const factory = new TransformerFactory(schema => !!schema.tagged);
      expect(factory.hasTransformableFields(schema as any)).toBe(false);
    });

    it('should return true when root schema itself is transformable', () => {
      const schema = {
        [BRAND]: true,
        $id: 'RootTagged',
        type: 'object',
        tagged: true,
        properties: { str: { type: 'string' } },
      };

      const factory = new TransformerFactory(schema => !!schema.tagged);
      expect(factory.hasTransformableFields(schema as any)).toBe(true);
    });

    it('should return false for schema with oneOf containing no transformable fields', () => {
      const schema = {
        [BRAND]: true,
        $id: 'OneOfSchema',
        definitions: {
          VariantA: { $id: 'VariantA', type: 'object', properties: { name: { type: 'string' } } },
          VariantB: { $id: 'VariantB', type: 'object', properties: { id: { type: 'number' } } },
        },
        oneOf: [{ $ref: 'VariantA' }, { $ref: 'VariantB' }],
      };

      const factory = new TransformerFactory(schema => !!schema.tagged);
      expect(factory.hasTransformableFields(schema as any)).toBe(false);
    });

    it('should return true for schema with oneOf containing transformable fields', () => {
      const schema = {
        [BRAND]: true,
        $id: 'OneOfSchema',
        definitions: {
          VariantA: { $id: 'VariantA', type: 'object', properties: { name: { type: 'string', tagged: true } } },
          VariantB: { $id: 'VariantB', type: 'object', properties: { id: { type: 'number' } } },
        },
        oneOf: [{ $ref: 'VariantA' }, { $ref: 'VariantB' }],
      };

      const factory = new TransformerFactory(schema => !!schema.tagged);
      expect(factory.hasTransformableFields(schema as any)).toBe(true);
    });

    it('should return false for schema with anyOf containing no transformable fields', () => {
      const schema = {
        [BRAND]: true,
        $id: 'OneOfSchema',
        definitions: {
          VariantA: { $id: 'VariantA', type: 'object', properties: { name: { type: 'string' } } },
          VariantB: { $id: 'VariantB', type: 'object', properties: { id: { type: 'number' } } },
        },
        anyOf: [{ $ref: 'VariantA' }, { $ref: 'VariantB' }],
      };

      const factory = new TransformerFactory(schema => !!schema.tagged);
      expect(factory.hasTransformableFields(schema as any)).toBe(false);
    });

    it('should return true for schema with anyOf containing transformable fields', () => {
      const schema = {
        [BRAND]: true,
        $id: 'OneOfSchema',
        definitions: {
          VariantA: { $id: 'VariantA', type: 'object', properties: { name: { type: 'string' } } },
          VariantB: { $id: 'VariantB', type: 'object', properties: { id: { type: 'number', tagged: true } } },
        },
        anyOf: [{ $ref: 'VariantA' }, { $ref: 'VariantB' }],
      };

      const factory = new TransformerFactory(schema => !!schema.tagged);
      expect(factory.hasTransformableFields(schema as any)).toBe(true);
    });

    it('should return false for schema with discriminator containing no transformable fields', () => {
      const schema = {
        [BRAND]: true,
        $id: 'DiscriminatorSchema',
        type: 'object',
        definitions: {
          Cat: { $id: 'Cat', type: 'object', properties: { type: { const: 'cat' }, name: { type: 'string' } } },
          Dog: { $id: 'Dog', type: 'object', properties: { type: { const: 'dog' }, breed: { type: 'string' } } },
        },
        discriminator: { propertyName: 'type', mapping: { cat: 'Cat', dog: 'Dog' } },
        oneOf: [{ $ref: 'Cat' }, { $ref: 'Dog' }],
      };

      const factory = new TransformerFactory(schema => !!schema.tagged);
      expect(factory.hasTransformableFields(schema as any)).toBe(false);
    });

    it('should return true for schema with discriminator containing transformable fields', () => {
      const schema = {
        [BRAND]: true,
        $id: 'DiscriminatorSchema',
        type: 'object',
        definitions: {
          Cat: { $id: 'Cat', type: 'object', properties: { type: { const: 'cat' }, name: { type: 'string', tagged: true } } },
          Dog: { $id: 'Dog', type: 'object', properties: { type: { const: 'dog' }, breed: { type: 'string' } } },
        },
        discriminator: { propertyName: 'type', mapping: { cat: 'Cat', dog: 'Dog' } },
        oneOf: [{ $ref: 'Cat' }, { $ref: 'Dog' }],
      };

      const factory = new TransformerFactory(schema => !!schema.tagged);
      expect(factory.hasTransformableFields(schema as any)).toBe(true);
    });
  });

  describe('discriminator transformation', () => {
    describe('const discriminator', () => {
      it('should transform data using const discriminator with oneOf', () => {
        const schema = {
          [BRAND]: true,
          $id: 'ConstDiscriminatorOneOf',
          type: 'object',
          definitions: {
            Cat: { $id: 'Cat', type: 'object', properties: { type: { const: 'cat' }, name: { type: 'string', tagged: true } } },
            Dog: { $id: 'Dog', type: 'object', properties: { type: { const: 'dog' }, breed: { type: 'string' } } },
          },
          oneOf: [{ $ref: 'Cat' }, { $ref: 'Dog' }],
        };

        const factory = new TransformerFactory(schema => !!schema.tagged);
        const transformer = factory.compile(schema as any);

        const catData = { type: 'cat', name: 'Whiskers' };
        const dogData = { type: 'dog', breed: 'Labrador' };

        expect(transformer(catData, () => 'xxx')).toStrictEqual({ type: 'cat', name: 'xxx' });
        expect(transformer(dogData, () => 'xxx')).toStrictEqual({ type: 'dog', breed: 'Labrador' });
      });

      it('should transform data using const discriminator with anyOf', () => {
        const schema = {
          [BRAND]: true,
          $id: 'ConstDiscriminatorAnyOf',
          type: 'object',
          definitions: {
            Circle: { $id: 'Circle', type: 'object', properties: { shape: { const: 'circle' }, radius: { type: 'number' } } },
            Square: { $id: 'Square', type: 'object', properties: { shape: { const: 'square' }, side: { type: 'number', tagged: true } } },
          },
          anyOf: [{ $ref: 'Circle' }, { $ref: 'Square' }],
        };

        const factory = new TransformerFactory(schema => !!schema.tagged);
        const transformer = factory.compile(schema as any);

        const circleData = { shape: 'circle', radius: 10 };
        const squareData = { shape: 'square', side: 5 };

        expect(transformer(circleData, () => 999)).toStrictEqual({ shape: 'circle', radius: 10 });
        expect(transformer(squareData, () => 999)).toStrictEqual({ shape: 'square', side: 999 });
      });

      it('should call action with correct context for const discriminator', () => {
        const schema = {
          [BRAND]: true,
          $id: 'ConstDiscriminatorContext',
          type: 'object',
          definitions: {
            TypeA: { $id: 'TypeA', type: 'object', properties: { kind: { const: 'a' }, value: { type: 'string', tagged: true } } },
            TypeB: { $id: 'TypeB', type: 'object', properties: { kind: { const: 'b' }, data: { type: 'string', tagged: true } } },
          },
          anyOf: [{ $ref: 'TypeA' }, { $ref: 'TypeB' }],
        };

        const factory = new TransformerFactory(schema => !!schema.tagged);
        const transformer = factory.compile(schema as any);

        const data = { kind: 'a', value: 'test' };
        const fn = mock(() => 'xxx');
        transformer(data, fn);

        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith('test', expect.objectContaining({ type: 'string', tagged: true }), expect.objectContaining({ field: 'value', path: 'value' }));
      });

      it('should handle numeric const discriminator values', () => {
        const schema = {
          [BRAND]: true,
          $id: 'NumericConstDiscriminator',
          type: 'object',
          definitions: {
            Version1: { $id: 'Version1', type: 'object', properties: { version: { const: 1 }, legacyField: { type: 'string', tagged: true } } },
            Version2: { $id: 'Version2', type: 'object', properties: { version: { const: 2 }, newField: { type: 'string', tagged: true } } },
          },
          oneOf: [{ $ref: 'Version1' }, { $ref: 'Version2' }],
        };

        const factory = new TransformerFactory(schema => !!schema.tagged);
        const transformer = factory.compile(schema as any);

        const v1Data = { version: 1, legacyField: 'old' };
        const v2Data = { version: 2, newField: 'new' };

        expect(transformer(v1Data, () => 'xxx')).toStrictEqual({ version: 1, legacyField: 'xxx' });
        expect(transformer(v2Data, () => 'xxx')).toStrictEqual({ version: 2, newField: 'xxx' });
      });

      it('should handle boolean const discriminator values', () => {
        const schema = {
          [BRAND]: true,
          $id: 'BooleanConstDiscriminator',
          type: 'object',
          definitions: {
            Active: { $id: 'Active', type: 'object', properties: { active: { const: true }, enabledFeature: { type: 'string', tagged: true } } },
            Inactive: { $id: 'Inactive', type: 'object', properties: { active: { const: false }, disabledReason: { type: 'string', tagged: true } } },
          },
          oneOf: [{ $ref: 'Active' }, { $ref: 'Inactive' }],
        };

        const factory = new TransformerFactory(schema => !!schema.tagged);
        const transformer = factory.compile(schema as any);

        const activeData = { active: true, enabledFeature: 'feature1' };
        const inactiveData = { active: false, disabledReason: 'maintenance' };

        expect(transformer(activeData, () => 'xxx')).toStrictEqual({ active: true, enabledFeature: 'xxx' });
        expect(transformer(inactiveData, () => 'xxx')).toStrictEqual({ active: false, disabledReason: 'xxx' });
      });
    });

    describe('type discriminator', () => {
      it('should transform data using type discriminator', () => {
        const schema = {
          [BRAND]: true,
          $id: 'TypeDiscriminator',
          type: 'object',
          definitions: {
            StringVariant: { $id: 'StringVariant', type: 'object', properties: { value: { type: 'string' }, strField: { type: 'string', tagged: true } } },
            NumberVariant: { $id: 'NumberVariant', type: 'object', properties: { value: { type: 'number' }, numField: { type: 'number', tagged: true } } },
          },
          oneOf: [{ $ref: 'StringVariant' }, { $ref: 'NumberVariant' }],
        };

        const factory = new TransformerFactory(schema => !!schema.tagged);
        const transformer = factory.compile(schema as any);

        const strData = { value: 'hello', strField: 'world' };
        const numData = { value: 42, numField: 100 };

        expect(transformer(strData, () => 'xxx')).toStrictEqual({ value: 'hello', strField: 'xxx' });
        expect(transformer(numData, () => 999)).toStrictEqual({ value: 42, numField: 999 });
      });

      it('should transform data using type discriminator with anyOf', () => {
        const schema = {
          [BRAND]: true,
          $id: 'TypeDiscriminatorAnyOf',
          type: 'object',
          definitions: {
            BooleanVariant: { $id: 'BooleanVariant', type: 'object', properties: { boolField: { type: 'string', tagged: true } } },
            StringVariant: { $id: 'StringVariant', type: 'object', properties: { strField: { type: 'string', tagged: true } } },
          },
          anyOf: [{ $ref: 'BooleanVariant' }, { $ref: 'StringVariant' }],
        };

        const factory = new TransformerFactory(schema => !!schema.tagged);
        const transformer = factory.compile(schema as any);

        const boolData = { boolField: 'boolean variant' };
        const objData = { strField: 'string variant' };

        expect(transformer(boolData, () => 'xxx')).toStrictEqual({ boolField: 'xxx' });
        expect(transformer(objData, () => 'xxx')).toStrictEqual({ strField: 'xxx' });
      });
    });

    describe('enum discriminator', () => {
      it('should transform data using enum discriminator', () => {
        const schema = {
          [BRAND]: true,
          $id: 'EnumDiscriminator',
          type: 'object',
          definitions: {
            SmallSize: { $id: 'SmallSize', type: 'object', properties: { size: { enum: ['xs', 'sm'] }, smallField: { type: 'string', tagged: true } } },
            LargeSize: { $id: 'LargeSize', type: 'object', properties: { size: { enum: ['lg', 'xl'] }, largeField: { type: 'string', tagged: true } } },
          },
          oneOf: [{ $ref: 'SmallSize' }, { $ref: 'LargeSize' }],
        };

        const factory = new TransformerFactory(schema => !!schema.tagged);
        const transformer = factory.compile(schema as any);

        const smallData = { size: 'xs', smallField: 'tiny' };
        const largeData = { size: 'xl', largeField: 'huge' };

        expect(transformer(smallData, () => 'xxx')).toStrictEqual({ size: 'xs', smallField: 'xxx' });
        expect(transformer(largeData, () => 'xxx')).toStrictEqual({ size: 'xl', largeField: 'xxx' });
      });

      it('should transform data using enum discriminator with anyOf', () => {
        const schema = {
          [BRAND]: true,
          $id: 'EnumDiscriminatorAnyOf',
          type: 'object',
          definitions: {
            PrimaryColor: { $id: 'PrimaryColor', type: 'object', properties: { color: { enum: ['red', 'blue', 'yellow'] }, primaryField: { type: 'string', tagged: true } } },
            SecondaryColor: {
              $id: 'SecondaryColor',
              type: 'object',
              properties: { color: { enum: ['green', 'orange', 'purple'] }, secondaryField: { type: 'string', tagged: true } },
            },
          },
          anyOf: [{ $ref: 'PrimaryColor' }, { $ref: 'SecondaryColor' }],
        };

        const factory = new TransformerFactory(schema => !!schema.tagged);
        const transformer = factory.compile(schema as any);

        const primaryData = { color: 'red', primaryField: 'primary' };
        const secondaryData = { color: 'green', secondaryField: 'secondary' };

        expect(transformer(primaryData, () => 'xxx')).toStrictEqual({ color: 'red', primaryField: 'xxx' });
        expect(transformer(secondaryData, () => 'xxx')).toStrictEqual({ color: 'green', secondaryField: 'xxx' });
      });

      it('should handle numeric enum discriminator values', () => {
        const schema = {
          [BRAND]: true,
          $id: 'NumericEnumDiscriminator',
          type: 'object',
          definitions: {
            LowPriority: { $id: 'LowPriority', type: 'object', properties: { priority: { enum: [1, 2, 3] }, lowField: { type: 'string', tagged: true } } },
            HighPriority: { $id: 'HighPriority', type: 'object', properties: { priority: { enum: [7, 8, 9] }, highField: { type: 'string', tagged: true } } },
          },
          oneOf: [{ $ref: 'LowPriority' }, { $ref: 'HighPriority' }],
        };

        const factory = new TransformerFactory(schema => !!schema.tagged);
        const transformer = factory.compile(schema as any);

        const lowData = { priority: 2, lowField: 'low priority task' };
        const highData = { priority: 9, highField: 'critical task' };

        expect(transformer(lowData, () => 'xxx')).toStrictEqual({ priority: 2, lowField: 'xxx' });
        expect(transformer(highData, () => 'xxx')).toStrictEqual({ priority: 9, highField: 'xxx' });
      });
    });

    describe('fallback (no discriminator)', () => {
      it('should apply all variant transformers when no valid discriminator exists', () => {
        const schema = {
          [BRAND]: true,
          $id: 'NoDiscriminator',
          type: 'object',
          definitions: {
            VariantA: { $id: 'VariantA', type: 'object', properties: { fieldA: { type: 'string', tagged: true } } },
            VariantB: { $id: 'VariantB', type: 'object', properties: { fieldB: { type: 'string', tagged: true } } },
          },
          oneOf: [{ $ref: 'VariantA' }, { $ref: 'VariantB' }],
        };

        const factory = new TransformerFactory(schema => !!schema.tagged);
        const transformer = factory.compile(schema as any);

        const dataA = { fieldA: 'valueA' };
        const dataB = { fieldB: 'valueB' };
        const dataBoth = { fieldA: 'valueA', fieldB: 'valueB' };

        expect(transformer(dataA, () => 'xxx')).toStrictEqual({ fieldA: 'xxx' });
        expect(transformer(dataB, () => 'xxx')).toStrictEqual({ fieldB: 'xxx' });
        expect(transformer(dataBoth, () => 'xxx')).toStrictEqual({ fieldA: 'xxx', fieldB: 'xxx' });
      });

      it('should apply all variant transformers with anyOf when no discriminator exists', () => {
        const schema = {
          [BRAND]: true,
          $id: 'NoDiscriminatorAnyOf',
          type: 'object',
          definitions: {
            TypeX: { $id: 'TypeX', type: 'object', properties: { x: { type: 'number', tagged: true } } },
            TypeY: { $id: 'TypeY', type: 'object', properties: { y: { type: 'number', tagged: true } } },
          },
          anyOf: [{ $ref: 'TypeX' }, { $ref: 'TypeY' }],
        };

        const factory = new TransformerFactory(schema => !!schema.tagged);
        const transformer = factory.compile(schema as any);

        const dataX = { x: 10 };
        const dataY = { y: 20 };
        const dataXY = { x: 10, y: 20 };

        expect(transformer(dataX, () => 999)).toStrictEqual({ x: 999 });
        expect(transformer(dataY, () => 999)).toStrictEqual({ y: 999 });
        expect(transformer(dataXY, () => 999)).toStrictEqual({ x: 999, y: 999 });
      });

      it('should not apply discriminator when enums overlap', () => {
        const schema = {
          [BRAND]: true,
          $id: 'OverlappingEnums',
          type: 'object',
          definitions: {
            SetA: { $id: 'SetA', type: 'object', properties: { value: { enum: [1, 2, 3] }, aField: { type: 'string', tagged: true } } },
            SetB: { $id: 'SetB', type: 'object', properties: { value: { enum: [3, 4, 5] }, bField: { type: 'string', tagged: true } } },
          },
          oneOf: [{ $ref: 'SetA' }, { $ref: 'SetB' }],
        };

        const factory = new TransformerFactory(schema => !!schema.tagged);
        const transformer = factory.compile(schema as any);

        /** Since enums overlap at 3, no discriminator is used, all transformers apply */
        const data = { value: 3, aField: 'a', bField: 'b' };
        expect(transformer(data, () => 'xxx')).toStrictEqual({ value: 3, aField: 'xxx', bField: 'xxx' });
      });
    });

    describe('nested discriminator schemas', () => {
      it('should transform nested object with discriminator', () => {
        const schema = {
          [BRAND]: true,
          $id: 'NestedDiscriminator',
          type: 'object',
          definitions: {
            Cat: { $id: 'Cat', type: 'object', properties: { type: { const: 'cat' }, meow: { type: 'string', tagged: true } } },
            Dog: { $id: 'Dog', type: 'object', properties: { type: { const: 'dog' }, bark: { type: 'string', tagged: true } } },
            Animal: { $id: 'Animal', type: 'object', oneOf: [{ $ref: 'Cat' }, { $ref: 'Dog' }] },
          },
          properties: {
            name: { type: 'string', tagged: true },
            pet: { $ref: 'Animal' },
          },
        };

        const factory = new TransformerFactory(schema => !!schema.tagged);
        const transformer = factory.compile(schema as any);

        const data = { name: 'John', pet: { type: 'cat', meow: 'meow meow' } };
        expect(transformer(data, () => 'xxx')).toStrictEqual({ name: 'xxx', pet: { type: 'cat', meow: 'xxx' } });
      });

      it('should transform array of discriminated types', () => {
        const schema = {
          [BRAND]: true,
          $id: 'ArrayOfDiscriminated',
          type: 'object',
          definitions: {
            Circle: { $id: 'Circle', type: 'object', properties: { kind: { const: 'circle' }, radius: { type: 'number', tagged: true } } },
            Rect: { $id: 'Rect', type: 'object', properties: { kind: { const: 'rect' }, width: { type: 'number', tagged: true } } },
            Shape: { $id: 'Shape', type: 'object', oneOf: [{ $ref: 'Circle' }, { $ref: 'Rect' }] },
          },
          properties: {
            shapes: { type: 'array', items: { $ref: 'Shape' } },
          },
        };

        const factory = new TransformerFactory(schema => !!schema.tagged);
        const transformer = factory.compile(schema as any);

        const data = {
          shapes: [
            { kind: 'circle', radius: 10 },
            { kind: 'rect', width: 20 },
            { kind: 'circle', radius: 30 },
          ],
        };

        expect(transformer(data, () => 999)).toStrictEqual({
          shapes: [
            { kind: 'circle', radius: 999 },
            { kind: 'rect', width: 999 },
            { kind: 'circle', radius: 999 },
          ],
        });
      });
    });
  });
});
