export function renderPostgresQuery(query: string, params: unknown[]): string {
  // Last to first, so $10 is not replaced as $1 followed by a literal 0. Log-readability only; not a safe SQL renderer.
  let formattedQuery = query;
  for (let index = params.length - 1; index >= 0; index--) {
    const param = params[index];
    const value = typeof param === 'string' ? `'${param}'` : String(param);
    formattedQuery = formattedQuery.replace(`$${index + 1}`, value);
  }
  return formattedQuery;
}
