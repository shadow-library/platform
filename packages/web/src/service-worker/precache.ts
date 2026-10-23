export class PrecacheError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
    readonly redirected: boolean,
  ) {
    super(redirected ? `Precache of ${url} was redirected` : `Precache of ${url} failed with status ${status}`);
    this.name = 'PrecacheError';
  }
}

/**
 * `Cache.addAll` follows redirects and would store a gated shell as the login page, which no navigation may be served;
 * a redirect fails the install instead. All-or-nothing like `addAll`: nothing is written unless every URL succeeds.
 */
export async function precacheUrls(cache: Cache, urls: readonly string[]): Promise<void> {
  const responses = await Promise.all(
    urls.map(async url => {
      const response = await fetch(url, { redirect: 'manual' });
      if (!response.ok) throw new PrecacheError(url, response.status, response.type === 'opaqueredirect');
      return { url, response };
    }),
  );
  await Promise.all(responses.map(({ url, response }) => cache.put(url, response)));
}
