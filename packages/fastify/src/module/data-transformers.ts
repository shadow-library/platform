import { InbuiltTransformers } from '@lib/decorators';

export const INBUILT_TRANSFORMERS: InbuiltTransformers = {
  'email:normalize': value => value.trim().toLowerCase(),
  'string:trim': value => value.trim(),

  'int:parse': value => parseInt(value, 10),
  'float:parse': value => parseFloat(value),
  'bigint:parse': value => BigInt(value),

  'strip:null': value => (value === null ? undefined : value),
};
