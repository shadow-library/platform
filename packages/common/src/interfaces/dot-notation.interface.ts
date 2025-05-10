/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export type DotNotation<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends object ? (T[K] extends any[] ? Record<`${Prefix}${K}`, T[K]> : DotNotation<T[K], `${Prefix}${K}.`>) : Record<`${Prefix}${K}`, T[K]>;
}[keyof T & string];
