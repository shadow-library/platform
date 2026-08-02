/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export type Theme = 'light' | 'dark';

/** What the user chose, as opposed to the `Theme` it currently resolves to: `system` follows the OS preference. */
export type ThemeMode = Theme | 'system';

export type JsonObject = { [Key in string]: JsonValue };
export type JsonArray = JsonValue[] | readonly JsonValue[];
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

export interface PaginationUpdate extends Record<string, string | number | boolean> {
  limit: number;
  skip: number;
}

export type VoidFn = () => void;
