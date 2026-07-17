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

/**
 * A unique, typed provider token.
 *
 * Unlike a bare string or symbol, an `InjectionToken<T>` carries the type of the value it resolves to,
 * so `app.get(token)` and `moduleRef.get(token)` return `T` without a manual cast.
 *
 * @example
 * const CONFIG = new InjectionToken<AppConfig>('CONFIG');
 * providers: [{ token: CONFIG, useValue: config }]  // useValue is checked against AppConfig
 * const config = app.get(CONFIG);                    // typed as AppConfig
 */
export class InjectionToken<T = unknown> {
  /** Phantom field carrying the resolved value type; never assigned at runtime. */
  declare private readonly _type: T;

  constructor(readonly description: string) {}

  toString(): string {
    return `InjectionToken(${this.description})`;
  }
}
