/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */
export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { [Key in string]: JsonValue };
export type JsonArray = JsonValue[] | readonly JsonValue[];
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

export type VoidFn = () => void;

/** A value a query string can carry; anything else is a serialisation decision the caller must make explicitly. */
export type QueryValue = string | number | boolean;

/** Query parameters as written at a call site — `undefined` entries are dropped rather than sent as the string "undefined". */
export type QueryParams = Record<string, QueryValue | undefined>;
