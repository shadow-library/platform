/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { CustomTransformers } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

declare module '@shadow-library/fastify' {
  interface CustomTransformers {
    'server-error:toObject': (value: Record<string, any>) => Record<string, any>;
  }
}

/**
 * Declaring the constants
 */

export const CUSTOM_DATA_TRANSFORMERS: CustomTransformers = {
  'server-error:toObject': (value: Record<string, any>): Record<string, any> => {
    return { code: value.error.code, type: value.error.type, message: value.error.msg };
  },
} as const;
