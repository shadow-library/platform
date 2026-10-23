/** Typed provider token: `app.get(token)` and `moduleRef.get(token)` return `T` without a cast. */
export class InjectionToken<T = unknown> {
  declare private readonly _type: T;

  constructor(readonly description: string) {}

  toString(): string {
    return `InjectionToken(${this.description})`;
  }
}
