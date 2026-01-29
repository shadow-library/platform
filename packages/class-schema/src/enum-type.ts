/**
 * Importing npm packages
 */
import { InternalError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { type ParsedSchema } from './class-schema';
import { getCounterId } from './constants';
import { EnumFieldSchema } from './interfaces';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export class EnumType<T extends string | number = string | number> {
  readonly id: string;
  readonly values: T[];
  readonly type: 'string' | 'number';
  readonly options: EnumFieldSchema;

  private constructor(name: string, values: T[], options: EnumFieldSchema) {
    this.id = `class-schema:${name}-enum-${getCounterId()}`;
    this.type = typeof values[0] === 'number' ? 'number' : 'string';
    this.values = values;
    this.options = options;

    const isValidEnum = values.every(v => typeof v === this.type);
    if (!isValidEnum) throw new InternalError('All enum values must be of the same type');
  }

  static create<T extends string | number>(name: string, values: T[], options: EnumFieldSchema = {}): EnumType<T> {
    return new EnumType<T>(name, values, options);
  }

  toSchema(): ParsedSchema {
    return { $id: this.id, type: this.type, enum: this.values, ...this.options };
  }
}
