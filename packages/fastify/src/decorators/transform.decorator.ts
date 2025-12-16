/**
 * Importing npm packages
 */

import { FieldMetadata } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export interface TransformOptions {
  input?: TransformTypes;
  output?: TransformTypes;
}

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type */
export interface CustomTransformers {}

export interface InbuiltTransformers {
  'email:normalize': (value: string) => string;
  'string:trim': (value: string) => string;

  'int:parse': (value: string) => number;
  'float:parse': (value: string) => number;
  'bigint:parse': (value: string) => bigint;
}

export type TransformTypes = keyof CustomTransformers | keyof InbuiltTransformers;

/**
 * Declaring the constants
 */

export function Transform(type: TransformTypes | TransformOptions): PropertyDecorator {
  const options = typeof type === 'string' ? { input: type, output: type } : type;
  return (target, propertyKey) => {
    const decorator = FieldMetadata({ 'x-fastify': { transform: options } });
    decorator(target, propertyKey);
  };
}
