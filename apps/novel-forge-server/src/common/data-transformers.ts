import { CustomTransformers } from '@shadow-library/fastify';

declare module '@shadow-library/fastify' {
  interface CustomTransformers {
    'server-error:toObject': (value: Record<string, any>) => Record<string, any>;
    'csv:split': (value: string) => string[];
  }
}

export const CUSTOM_DATA_TRANSFORMERS: CustomTransformers = {
  'server-error:toObject': (value: Record<string, any>): Record<string, any> => {
    return { code: value.error.code, type: value.error.type, message: value.error.msg };
  },
  'csv:split': (value: string): string[] => value.split(',').filter(Boolean),
} as const;
