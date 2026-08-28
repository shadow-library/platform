/**
 * The package carries zero internal dependencies so it stays browser-safe and independently consumable,
 * which rules out `@shadow-library/common`'s error hierarchy. These are plain `Error` subclasses instead.
 */
export class UnknownRatingLevelError extends Error {
  readonly dimension: string;
  readonly level: unknown;

  constructor(dimension: string, level: unknown) {
    super(`Unknown content rating level ${JSON.stringify(level)} for dimension '${dimension}'`);
    this.name = 'UnknownRatingLevelError';
    this.dimension = dimension;
    this.level = level;
  }
}
