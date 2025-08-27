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
    expect(transformer(data, () => 'xxx')).toEqual({ str: 'xxx', num: 123, bool: 'xxx', obj: {}, arr: 'xxx' });
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
    expect(transformer(data, () => 'xxx')).toEqual(['xxx', 'xxx', 'xxx', 'xxx']);
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
    expect(transformer(data, () => 'xxx')).toEqual({
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
});
