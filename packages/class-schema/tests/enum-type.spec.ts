/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

import { InternalError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { EnumType } from '@lib/enum-type';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('EnumType', () => {
  describe('create', () => {
    it('should create a string enum type', () => {
      const status = EnumType.create('Status', ['active', 'inactive', 'pending']);

      expect(status).toBeInstanceOf(EnumType);
      expect(status).toMatchObject({
        id: expect.stringContaining('class-schema:Status-enum-'),
        type: 'string',
        values: ['active', 'inactive', 'pending'],
        options: {},
      });
    });

    it('should create a number enum type', () => {
      const priority = EnumType.create('Priority', [1, 2, 3, 4, 5]);

      expect(priority).toBeInstanceOf(EnumType);
      expect(priority).toMatchObject({
        id: expect.stringContaining('class-schema:Priority-enum-'),
        type: 'number',
        values: [1, 2, 3, 4, 5],
        options: {},
      });
    });

    it('should create an enum with options', () => {
      const status = EnumType.create('Status', ['active', 'inactive'], { description: 'User status' });

      expect(status).toMatchObject({ options: { description: 'User status' } });
    });

    it('should throw error for mixed enum values', () => {
      expect(() => EnumType.create('Mixed', ['active', 1, 'pending'] as any)).toThrow(InternalError);
    });

    it('should generate unique ids for different enums', () => {
      const enum1 = EnumType.create('Enum', ['a', 'b']);
      const enum2 = EnumType.create('Enum', ['a', 'b']);

      expect(enum1.id).not.toBe(enum2.id);
    });
  });

  describe('toSchema', () => {
    it('should generate schema for string enum', () => {
      const status = EnumType.create('Status', ['active', 'inactive', 'pending']);
      const schema = status.toSchema();

      expect(schema).toEqual({
        $id: status.id,
        type: 'string',
        enum: ['active', 'inactive', 'pending'],
      });
    });

    it('should generate schema for number enum', () => {
      const priority = EnumType.create('Priority', [1, 2, 3, 4, 5]);
      const schema = priority.toSchema();

      expect(schema).toEqual({
        $id: priority.id,
        type: 'number',
        enum: [1, 2, 3, 4, 5],
      });
    });

    it('should include options in the schema', () => {
      const status = EnumType.create('Status', ['active', 'inactive'], {
        description: 'User status',
        nullable: true,
        optional: true,
      });
      const schema = status.toSchema();

      expect(schema).toEqual({
        $id: status.id,
        type: 'string',
        enum: ['active', 'inactive'],
        description: 'User status',
        nullable: true,
        optional: true,
      });
    });
  });
});
