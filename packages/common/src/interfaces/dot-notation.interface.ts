type Prev = [never, 0, 1, 2, 3, 4, 5, ...0[]];

export type DotNotation<T, Prefix extends string = '', D extends number = 5> = [D] extends [never]
  ? unknown
  : T extends object
    ? {
        [K in keyof T & string]: T[K] extends object
          ? T[K] extends any[]
            ? Record<`${Prefix}${K}`, T[K]>
            : DotNotation<T[K], `${Prefix}${K}.`, Prev[D]>
          : Record<`${Prefix}${K}`, T[K]>;
      }[keyof T & string]
    : never;
