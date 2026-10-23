import { Class } from 'type-fest';

import { ClassSchema } from '@lib/class-schema';

export type TypeOf<T> = T extends ClassSchema<Class<infer U>> ? U : T extends Class<infer U> ? U : never;
