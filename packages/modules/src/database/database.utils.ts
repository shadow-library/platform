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

export function renderPostgresQuery(query: string, params: unknown[]): string {
  /**
   * Substituting parameters from the last to the first to avoid replacing $10 as $1 followed by a literal 0.
   * This is a simple substitution and may not cover all edge cases, but it provides more readable logs for most queries.
   */
  let formattedQuery = query;
  for (let index = params.length - 1; index >= 0; index--) {
    const param = params[index];
    const value = typeof param === 'string' ? `'${param}'` : String(param);
    formattedQuery = formattedQuery.replace(`$${index + 1}`, value);
  }
  return formattedQuery;
}
