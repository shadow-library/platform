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
    'date:dmy': (value: number) => string;
    'server-error:toObject': (value: Record<string, any>) => Record<string, any>;
  }
}

/**
 * Declaring the constants
 */

export const CUSTOM_DATA_TRANSFORMERS: CustomTransformers = {
  /** converts a number in YYYYMMDD format to a string in DD-MM-YYYY format */
  'date:dmy': (value: number): string => {
    const day = value % 100;
    const month = Math.floor((value % 10_000) / 100);
    const year = Math.floor(value / 10_000);
    return `${day.toString().padStart(2, '0')}-${month.toString().padStart(2, '0')}-${year}`;
  },

  'server-error:toObject': (value: Record<string, any>): Record<string, any> => {
    return { code: value.error.code, type: value.error.type, message: value.error.msg };
  },
} as const;
