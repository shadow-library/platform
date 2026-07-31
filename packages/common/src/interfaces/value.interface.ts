/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export type PrimitiveValue = string | number | boolean | bigint | symbol;

export type MaybeArray<T> = T | T[];

export type MaybeNull<T> = T | null;

export type MaybeUndefined<T> = T | undefined;

export type Nullable<T> = T | null | undefined;

export type SyncValue<T = unknown> = T extends Promise<unknown> ? never : T;

/**
 * Identity alias that references a class purely as a type. Use it with `import type` on the far side of a
 * circular import so the class is never pulled in as a value — this sidesteps the runtime "Cannot access '…'
 * before initialization" error. It only helps in type positions; a runtime `extends`, `instanceof`, or
 * decorator reference still needs the value and must break the cycle another way.
 */
export type AsType<A> = A;
