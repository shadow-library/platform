/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { type ParsedSchema } from './class-schema';

/**
 * Defining types
 */

type TEnumType = typeof EnumType;

/**
 * Declaring the constants
 */

export abstract class EnumType {
  static readonly id: string;
  static readonly values: string[] | number[];
  static readonly type: 'string' | 'number';

  static isEnumType(obj: unknown): obj is TEnumType {
    return Object.prototype.isPrototypeOf.call(EnumType, obj as object);
  }

  static toSchema(enumClass: TEnumType): ParsedSchema {
    return { $id: enumClass.id, type: enumClass.type, enum: enumClass.values };
  }
}
