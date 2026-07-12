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

export type JsonObject = { [Key in string]: JsonValue };
export type JsonArray = JsonValue[] | readonly JsonValue[];
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/** The intent vocabulary shared by status chips, badges, and alerts. */
export type Intent = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent';

export interface PaginationUpdate extends Record<string, string | number | boolean> {
  limit: number;
  skip: number;
}
