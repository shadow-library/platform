import { CustomTransformers } from '@shadow-library/fastify';

declare module '@shadow-library/fastify' {
  interface CustomTransformers {
    'server-error:toObject': (value: Record<string, any>) => Record<string, any>;
  }
}

export const CUSTOM_DATA_TRANSFORMERS: CustomTransformers = {
  'server-error:toObject': (value: Record<string, any>): Record<string, any> => {
    return { code: value.error.code, type: value.error.type, message: value.error.msg };
  },
} as const;
