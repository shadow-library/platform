import { CustomTransformers } from '@shadow-library/fastify';

declare module '@shadow-library/fastify' {
  interface CustomTransformers {
    'server-error:toObject': (value: Record<string, any>) => Record<string, any>;
    'csv:split': (value: string) => string[];
    'date:parse': (value: string) => Date;
  }
}

export const CUSTOM_DATA_TRANSFORMERS: CustomTransformers = {
  'server-error:toObject': (value: Record<string, any>): Record<string, any> => {
    return { code: value.error.code, type: value.error.type, message: value.error.msg };
  },
  'csv:split': (value: string): string[] => value.split(',').filter(Boolean),
  // Invalid input becomes an Invalid Date, not a thrown error — the caller checks `Number.isNaN(date.getTime())` and reports a typed 400.
  'date:parse': (value: string): Date => new Date(value),
} as const;
